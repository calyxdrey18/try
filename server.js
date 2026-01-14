const express = require('express');
const path = require('path');
const fs = require('fs');
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason,
  Browsers 
} = require('@whiskeysockets/baileys');
const CommandHandler = require('./commands');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check for Render
app.get('/health', (req, res) => {
  res.json({ status: 'ok', bot: isConnected ? 'connected' : 'disconnected' });
});

// Global state
let sock = null;
let pairingCode = null;
let isConnected = false;
let commandHandler = null;

// Start WhatsApp
async function startWhatsApp(phoneForPair = null) {
  try {
    console.log('🚀 Starting WhatsApp Bot...');
    
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: Browsers.ubuntu('Chrome'),
      logger: { level: 'silent' }
    });

    // Initialize command handler
    commandHandler = new CommandHandler(sock);

    // Save credentials
    sock.ev.on('creds.update', saveCreds);

    // Connection updates
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      
      if (connection === 'open') {
        isConnected = true;
        console.log('✅ WhatsApp connected!');
        pairingCode = null;
        
        // Send welcome message
        try {
          if (sock.user?.id) {
            sock.sendMessage(sock.user.id, {
              text: '🤖 *Viral-Bot Mini Started!*\n\nBot is now online.\nUse .menu to see commands.'
            });
          }
        } catch (e) {
          console.log('Note: Could not send startup message');
        }
      }

      if (connection === 'close') {
        isConnected = false;
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          console.log('🔄 Reconnecting in 5 seconds...');
          setTimeout(() => startWhatsApp(), 5000);
        }
      }
    });

    // Pairing code
    if (phoneForPair && sock.authState?.creds && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          pairingCode = await sock.requestPairingCode(phoneForPair);
          console.log('🔐 Pairing Code:', pairingCode);
        } catch (error) {
          console.log('❌ Could not get pairing code');
          pairingCode = 'FAILED';
        }
      }, 3000);
    }

    // Message handler
    sock.ev.on('messages.upsert', async (data) => {
      try {
        const m = data.messages?.[0];
        if (!m?.message || m.key?.fromMe) return;
        
        if (commandHandler) {
          await commandHandler.handleMessage(m);
        }
      } catch (error) {
        console.log('Error processing message:', error.message);
      }
    });

  } catch (error) {
    console.error('Failed to start WhatsApp:', error);
    setTimeout(() => startWhatsApp(), 10000);
  }
}

// Pairing endpoint
app.post('/pair', async (req, res) => {
  try {
    let phone = String(req.body.phone || '').replace(/\D/g, '');
    
    if (!phone || phone.length < 10) {
      return res.json({ success: false, error: 'Invalid phone number' });
    }

    // Start or restart WhatsApp
    pairingCode = null;
    await startWhatsApp(phone);

    // Wait for pairing code
    let attempts = 0;
    const checkCode = setInterval(() => {
      attempts++;
      
      if (pairingCode) {
        clearInterval(checkCode);
        return res.json({ success: true, code: pairingCode });
      }
      
      if (attempts > 30) {
        clearInterval(checkCode);
        return res.json({ success: false, error: 'Timeout. Try again.' });
      }
    }, 1000);

  } catch (error) {
    res.json({ success: false, error: 'Server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
  
  // Check for existing session
  if (fs.existsSync('./auth/creds.json')) {
    console.log('🔑 Found existing session, restoring...');
    setTimeout(() => startWhatsApp(), 2000);
  } else {
    console.log('📱 Ready for pairing via web interface');
  }
});