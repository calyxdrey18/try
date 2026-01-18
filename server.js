const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store pair codes and clients
const pairCodes = new Map();
const clients = new Map();

app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Serve HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API to generate pair code for a number
app.post('/api/generate-pair-code', (req, res) => {
    const { number } = req.body;
    
    if (!number) {
        return res.status(400).json({ error: 'Number is required' });
    }

    // Clean number format
    const cleanNumber = number.replace(/\D/g, '');
    
    // Generate 6-digit pair code
    const pairCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store pair code with number and timestamp
    pairCodes.set(pairCode, {
        number: cleanNumber,
        createdAt: Date.now(),
        status: 'pending'
    });

    // Clean up old pair codes (older than 10 minutes)
    cleanupPairCodes();

    res.json({ 
        success: true, 
        pairCode,
        message: `Pair code generated for ${cleanNumber}. Use it within 10 minutes.`
    });
});

// API to check pair code status
app.get('/api/pair-status/:code', (req, res) => {
    const { code } = req.params;
    const pairData = pairCodes.get(code);
    
    if (!pairData) {
        return res.json({ status: 'invalid', message: 'Invalid pair code' });
    }
    
    res.json({
        status: pairData.status,
        number: pairData.number,
        timestamp: pairData.createdAt
    });
});

// Function to cleanup old pair codes
function cleanupPairCodes() {
    const now = Date.now();
    for (const [code, data] of pairCodes.entries()) {
        if (now - data.createdAt > 10 * 60 * 1000) { // 10 minutes
            pairCodes.delete(code);
        }
    }
}

// Initialize WhatsApp client for pair code
function initializeWhatsAppClient(pairCode, number) {
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: `client_${pairCode}` }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.on('qr', (qr) => {
        console.log(`QR generated for ${number}`);
        // You could store this QR for display if needed
    });

    client.on('ready', () => {
        console.log(`Client ${pairCode} is ready!`);
        
        // Update pair code status
        const pairData = pairCodes.get(pairCode);
        if (pairData) {
            pairData.status = 'connected';
            pairData.connectedAt = Date.now();
            pairData.clientId = pairCode;
        }
        
        // Send welcome message
        client.sendMessage(`${number}@c.us`, 
            '🤖 *WhatsApp Bot Connected!*\n\n' +
            'Available commands:\n' +
            '*.menu* - Show all commands\n' +
            '*.info* - Bot information\n' +
            '*.about* - About this bot\n' +
            '*.ping* - Check bot response\n\n' +
            'Type *.menu* to get started!'
        );
    });

    client.on('message', async (message) => {
        console.log(`Message from ${message.from}: ${message.body}`);
        
        // Load commands
        const commands = require('./commands.js');
        
        // Check if message is a command
        const command = message.body.toLowerCase().trim();
        
        if (command.startsWith('.menu')) {
            await commands.handleMenu(client, message);
        } else if (command.startsWith('.info')) {
            await commands.handleInfo(client, message);
        } else if (command.startsWith('.about')) {
            await commands.handleAbout(client, message);
        } else if (command.startsWith('.ping')) {
            await commands.handlePing(client, message);
        } else if (command.startsWith('.')) {
            await message.reply('❌ Unknown command. Type *.menu* for available commands.');
        }
    });

    client.on('disconnected', (reason) => {
        console.log(`Client ${pairCode} disconnected:`, reason);
        pairCodes.delete(pairCode);
        clients.delete(pairCode);
    });

    client.initialize();
    clients.set(pairCode, client);
    
    return client;
}

// WebSocket for real-time updates
io.on('connection', (socket) => {
    console.log('Client connected via WebSocket');
    
    socket.on('check-status', (pairCode) => {
        const pairData = pairCodes.get(pairCode);
        if (pairData) {
            socket.emit('status-update', {
                status: pairData.status,
                number: pairData.number
            });
        }
    });
    
    socket.on('initialize-whatsapp', ({ pairCode, number }) => {
        const pairData = pairCodes.get(pairCode);
        if (pairData && pairData.status === 'pending') {
            initializeWhatsAppClient(pairCode, number);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected from WebSocket');
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get all active pair codes (for debugging)
app.get('/api/active-pairs', (req, res) => {
    const activePairs = Array.from(pairCodes.entries()).map(([code, data]) => ({
        code,
        ...data
    }));
    res.json({ activePairs, total: activePairs.length });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});

// Export for testing
module.exports = { app, server, pairCodes };