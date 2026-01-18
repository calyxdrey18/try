const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { WhatsappManager } = require('./whatsapp.js');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Initialize WhatsApp Manager
const whatsappManager = new WhatsappManager(io);

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Serve HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API to generate pair code
app.post('/api/generate-pair-code', async (req, res) => {
    try {
        const { number } = req.body;
        
        if (!number) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone number is required' 
            });
        }

        // Clean and validate number
        const cleanNumber = number.replace(/\D/g, '');
        
        if (cleanNumber.length < 10) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid phone number' 
            });
        }

        // Generate pair code and request
        const result = await whatsappManager.generatePairCode(cleanNumber);
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error generating pair code:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate pair code' 
        });
    }
});

// API to verify pair code
app.post('/api/verify-pair-code', async (req, res) => {
    try {
        const { pairCode, code } = req.body;
        
        if (!pairCode || !code) {
            return res.status(400).json({ 
                success: false, 
                error: 'Pair code and verification code are required' 
            });
        }

        const result = await whatsappManager.verifyPairCode(pairCode, code);
        
        res.json(result);
    } catch (error) {
        console.error('Error verifying pair code:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to verify pair code' 
        });
    }
});

// API to get pair status
app.get('/api/pair-status/:pairCode', (req, res) => {
    const { pairCode } = req.params;
    const status = whatsappManager.getPairStatus(pairCode);
    
    res.json({
        success: true,
        ...status
    });
});

// API to get active sessions
app.get('/api/active-sessions', (req, res) => {
    const sessions = whatsappManager.getActiveSessions();
    res.json({
        success: true,
        sessions,
        count: sessions.length
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    const sessions = whatsappManager.getActiveSessions();
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        activeSessions: sessions.length,
        memoryUsage: process.memoryUsage()
    });
});

// WebSocket connection
io.on('connection', (socket) => {
    console.log('Client connected via WebSocket:', socket.id);
    
    socket.on('join-pair-room', (pairCode) => {
        socket.join(`pair-${pairCode}`);
        console.log(`Socket ${socket.id} joined pair room: ${pairCode}`);
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});

module.exports = { app, server };