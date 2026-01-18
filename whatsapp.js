const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs').promises;
const path = require('path');
const commands = require('./commands.js');
const { v4: uuidv4 } = require('uuid');

class WhatsappManager {
    constructor(io) {
        this.io = io;
        this.pairCodes = new Map(); // pairCode -> { number, createdAt, expiresAt, status, verificationCode }
        this.sessions = new Map(); // number -> { sock, pairCode, connectedAt }
        this.pairRequests = new Map(); // number -> { pairCode, socketId, timeout }
        this.sessionDir = path.join(__dirname, 'sessions');
        
        // Initialize session directory
        this.ensureSessionDir();
    }
    
    async ensureSessionDir() {
        try {
            await fs.access(this.sessionDir);
        } catch {
            await fs.mkdir(this.sessionDir, { recursive: true });
        }
    }
    
    generatePairCode() {
        // Generate 8-digit pair code
        const pairCode = Math.floor(10000000 + Math.random() * 90000000).toString();
        return pairCode;
    }
    
    generateVerificationCode() {
        // Generate 6-digit verification code
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    
    async generatePairCode(number) {
        // Clean up expired pair codes
        this.cleanupPairCodes();
        
        // Check if number already has active session
        if (this.sessions.has(number)) {
            return {
                pairCode: null,
                message: 'This number already has an active session. Disconnect existing session first.',
                alreadyConnected: true
            };
        }
        
        // Check for existing pending pair request
        if (this.pairRequests.has(number)) {
            const existing = this.pairRequests.get(number);
            clearTimeout(existing.timeout);
        }
        
        const pairCode = this.generatePairCode();
        const verificationCode = this.generateVerificationCode();
        
        // Store pair code
        this.pairCodes.set(pairCode, {
            number,
            verificationCode,
            createdAt: Date.now(),
            expiresAt: Date.now() + (10 * 60 * 1000), // 10 minutes
            status: 'pending',
            attempts: 0
        });
        
        // Store pair request
        const timeout = setTimeout(() => {
            this.cancelPairRequest(number);
        }, 10 * 60 * 1000); // 10 minutes
        
        this.pairRequests.set(number, {
            pairCode,
            verificationCode,
            timeout
        });
        
        console.log(`Generated pair code ${pairCode} for ${number}`);
        
        return {
            pairCode,
            verificationCode,
            message: `Pair code generated. You have 10 minutes to complete pairing.`,
            expiresIn: 10 * 60 // 10 minutes in seconds
        };
    }
    
    async verifyPairCode(pairCode, code) {
        const pairData = this.pairCodes.get(pairCode);
        
        if (!pairData) {
            return {
                success: false,
                error: 'Invalid pair code'
            };
        }
        
        if (pairData.status !== 'pending') {
            return {
                success: false,
                error: `Pair code already ${pairData.status}`
            };
        }
        
        if (Date.now() > pairData.expiresAt) {
            this.pairCodes.delete(pairCode);
            return {
                success: false,
                error: 'Pair code expired'
            };
        }
        
        if (pairData.verificationCode !== code) {
            pairData.attempts++;
            
            if (pairData.attempts >= 3) {
                this.pairCodes.delete(pairCode);
                return {
                    success: false,
                    error: 'Too many failed attempts. Pair code invalidated.'
                };
            }
            
            return {
                success: false,
                error: `Invalid verification code. ${3 - pairData.attempts} attempts remaining.`
            };
        }
        
        // Verification successful - start WhatsApp connection
        pairData.status = 'verified';
        
        try {
            await this.startWhatsAppConnection(pairData.number, pairCode);
            
            return {
                success: true,
                message: 'Pairing successful! WhatsApp connection initiated.',
                number: pairData.number
            };
        } catch (error) {
            console.error('Error starting WhatsApp connection:', error);
            return {
                success: false,
                error: 'Failed to start WhatsApp connection. Please try again.'
            };
        }
    }
    
    async startWhatsAppConnection(number, pairCode) {
        try {
            // Create session directory for this number
            const sessionPath = path.join(this.sessionDir, number);
            await this.ensureSessionDir();
            
            // Get auth state
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            
            // Create WhatsApp socket
            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                browser: ['WhatsApp Bot', 'Chrome', '3.0'],
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                defaultQueryTimeoutMs: 60_000,
            });
            
            // Save credentials when updated
            sock.ev.on('creds.update', saveCreds);
            
            // Handle connection updates
            sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    console.log(`QR received for ${number}, but we're using pair code`);
                    return;
                }
                
                if (connection === 'close') {
                    const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                    console.log(`Connection closed for ${number}, reason: ${reason}`);
                    
                    // Clean up session
                    this.cleanupSession(number);
                    
                    // Notify via WebSocket
                    this.io.to(`pair-${pairCode}`).emit('pair-status', {
                        status: 'disconnected',
                        number,
                        reason: reason || 'Connection closed'
                    });
                    
                    // Try to reconnect
                    if (reason !== 403) { // Don't reconnect if banned
                        setTimeout(() => {
                            this.startWhatsAppConnection(number, pairCode);
                        }, 5000);
                    }
                }
                
                if (connection === 'open') {
                    console.log(`WhatsApp connected for ${number}`);
                    
                    // Store session
                    this.sessions.set(number, {
                        sock,
                        pairCode,
                        connectedAt: Date.now()
                    });
                    
                    // Update pair code status
                    const pairData = this.pairCodes.get(pairCode);
                    if (pairData) {
                        pairData.status = 'connected';
                        pairData.connectedAt = Date.now();
                    }
                    
                    // Clean up pair request
                    this.pairRequests.delete(number);
                    
                    // Send welcome message
                    this.sendWelcomeMessage(number);
                    
                    // Notify via WebSocket
                    this.io.to(`pair-${pairCode}`).emit('pair-status', {
                        status: 'connected',
                        number,
                        connectedAt: new Date().toISOString()
                    });
                }
                
                if (connection === 'connecting') {
                    console.log(`Connecting WhatsApp for ${number}`);
                    this.io.to(`pair-${pairCode}`).emit('pair-status', {
                        status: 'connecting',
                        number
                    });
                }
            });
            
            // Handle incoming messages
            sock.ev.on('messages.upsert', async (m) => {
                const msg = m.messages[0];
                
                if (!msg.message || msg.key.fromMe) return;
                
                const messageBody = msg.message.conversation || 
                                  msg.message.extendedTextMessage?.text ||
                                  '';
                
                if (messageBody.startsWith('.')) {
                    await this.handleCommand(number, messageBody);
                }
            });
            
            console.log(`WhatsApp connection started for ${number}`);
            
        } catch (error) {
            console.error('Error in startWhatsAppConnection:', error);
            throw error;
        }
    }
    
    async sendWelcomeMessage(number) {
        try {
            const session = this.sessions.get(number);
            if (!session) return;
            
            const welcomeMsg = `🤖 *WhatsApp Bot Connected!*\n\n` +
                              `✅ You are now connected to the WhatsApp Bot\n\n` +
                              `📋 *Available Commands:*\n` +
                              `• .menu - Show all commands\n` +
                              `• .info - Bot information\n` +
                              `• .about - About this bot\n` +
                              `• .ping - Check bot response\n\n` +
                              `Type *.menu* to get started!`;
            
            await session.sock.sendMessage(`${number}@s.whatsapp.net`, { 
                text: welcomeMsg 
            });
        } catch (error) {
            console.error('Error sending welcome message:', error);
        }
    }
    
    async handleCommand(number, command) {
        try {
            const session = this.sessions.get(number);
            if (!session) return;
            
            const commandText = command.toLowerCase().trim();
            let response = '';
            
            if (commandText === '.menu') {
                response = await commands.handleMenu();
            } else if (commandText === '.info') {
                response = await commands.handleInfo();
            } else if (commandText === '.about') {
                response = await commands.handleAbout();
            } else if (commandText === '.ping') {
                response = await commands.handlePing();
            } else if (commandText.startsWith('.')) {
                response = '❌ Unknown command. Type *.menu* for available commands.';
            }
            
            if (response) {
                await session.sock.sendMessage(`${number}@s.whatsapp.net`, { 
                    text: response 
                });
            }
        } catch (error) {
            console.error('Error handling command:', error);
        }
    }
    
    getPairStatus(pairCode) {
        const pairData = this.pairCodes.get(pairCode);
        
        if (!pairData) {
            return {
                status: 'invalid',
                message: 'Pair code not found'
            };
        }
        
        const now = Date.now();
        const expiresIn = Math.max(0, Math.floor((pairData.expiresAt - now) / 1000));
        
        return {
            status: pairData.status,
            number: pairData.number,
            createdAt: pairData.createdAt,
            expiresIn,
            expiresAt: pairData.expiresAt,
            connectedAt: pairData.connectedAt
        };
    }
    
    getActiveSessions() {
        const sessions = [];
        
        for (const [number, session] of this.sessions.entries()) {
            sessions.push({
                number,
                pairCode: session.pairCode,
                connectedAt: session.connectedAt,
                uptime: Date.now() - session.connectedAt
            });
        }
        
        return sessions;
    }
    
    cancelPairRequest(number) {
        const request = this.pairRequests.get(number);
        if (request) {
            clearTimeout(request.timeout);
            this.pairRequests.delete(number);
            
            // Also remove from pairCodes if still pending
            if (this.pairCodes.has(request.pairCode)) {
                const pairData = this.pairCodes.get(request.pairCode);
                if (pairData.status === 'pending') {
                    this.pairCodes.delete(request.pairCode);
                }
            }
        }
    }
    
    cleanupPairCodes() {
        const now = Date.now();
        
        for (const [pairCode, data] of this.pairCodes.entries()) {
            if (now > data.expiresAt && data.status !== 'connected') {
                this.pairCodes.delete(pairCode);
            }
        }
    }
    
    cleanupSession(number) {
        if (this.sessions.has(number)) {
            const session = this.sessions.get(number);
            
            // Close socket if still open
            if (session.sock) {
                try {
                    session.sock.end();
                } catch (error) {
                    console.error('Error closing socket:', error);
                }
            }
            
            this.sessions.delete(number);
        }
    }
    
    // Method to send message to a number
    async sendMessage(number, text) {
        try {
            const session = this.sessions.get(number);
            if (!session) {
                throw new Error('No active session for this number');
            }
            
            await session.sock.sendMessage(`${number}@s.whatsapp.net`, { 
                text 
            });
            
            return { success: true };
        } catch (error) {
            console.error('Error sending message:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = { WhatsappManager };