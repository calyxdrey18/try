// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBailesVersion,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const CommandHandler = require("./commands");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (_, res) =>
  res.sendFile(path.join(__dirname, "index.html"))
);

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

/* ===================== GLOBAL STATE ===================== */
let activeBots = new Map(); // Map to store multiple bot instances: phone -> {sock, handler, pairingCode}
let connectionAttempts = new Map(); // Track connection attempts

/* ===================== WHATSAPP CORE ===================== */
async function startWhatsApp(phoneForPair) {
  console.log(`🚀 Starting WhatsApp connection for: ${phoneForPair}`);
  
  // Prevent multiple connection attempts for same phone
  if (connectionAttempts.has(phoneForPair)) {
    console.log(`⚠️ Already attempting connection for ${phoneForPair}`);
    return;
  }
  
  connectionAttempts.set(phoneForPair, true);

  try {
    // Create unique directory for this phone number's auth
    const cleanPhone = phoneForPair.replace(/\D/g, '');
    const authDir = `./auth_${cleanPhone}`;
    
    console.log(`📁 Using auth directory: ${authDir}`);
    
    // Ensure auth directory exists
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`📱 Creating WhatsApp socket for ${phoneForPair}`);

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "error" }), // Change to error for debugging
      browser: Browsers.ubuntu("Chrome"),
      printQRInTerminal: true, // Enable QR for debugging
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000
    });

    // Create unique bot ID
    const botId = `bot_${cleanPhone}`;
    
    // Initialize command handler for this bot
    const commandHandler = new CommandHandler(sock, botId);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      console.log(`🔌 Connection update for ${phoneForPair}:`, connection);
      
      if (qr) {
        console.log(`📱 QR Code generated for ${phoneForPair}`);
      }

      if (connection === "open") {
        console.log(`✅ WhatsApp Connected successfully for ${phoneForPair}`);
        
        // Store bot instance
        activeBots.set(phoneForPair, {
          sock: sock,
          handler: commandHandler,
          pairingCode: null,
          connected: true,
          authDir: authDir
        });
        
        connectionAttempts.delete(phoneForPair);
      }

      if (connection === "close") {
        console.log(`❌ Connection closed for ${phoneForPair}`);
        
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        console.log(`🔄 Should reconnect ${phoneForPair}:`, shouldReconnect);
        
        // Remove from active bots
        activeBots.delete(phoneForPair);
        connectionAttempts.delete(phoneForPair);
        
        if (shouldReconnect) {
          console.log(`⏳ Reconnecting ${phoneForPair} in 5 seconds...`);
          setTimeout(() => startWhatsApp(phoneForPair), 5000);
        }
      }
    });

    // Pairing code request - only if not registered
    if (phoneForPair && !sock.authState.creds.registered) {
      console.log(`🔐 Requesting pairing code for: ${phoneForPair}`);
      
      // Wait a bit for connection to stabilize
      setTimeout(async () => {
        try {
          console.log(`📞 Attempting to get pairing code for ${phoneForPair}...`);
          
          // Validate phone format
          const formattedPhone = phoneForPair.includes('@') 
            ? phoneForPair 
            : `${phoneForPair.replace(/\D/g, '')}@s.whatsapp.net`;
          
          console.log(`📱 Formatted phone for pairing: ${formattedPhone}`);
          
          const pairingCode = await sock.requestPairingCode(formattedPhone);
          console.log(`✅ Pairing Code for ${phoneForPair}: ${pairingCode}`);
          
          // Update pairing code in active bots
          if (activeBots.has(phoneForPair)) {
            const botData = activeBots.get(phoneForPair);
            botData.pairingCode = pairingCode;
            activeBots.set(phoneForPair, botData);
          } else {
            // Store in active bots even if not fully connected yet
            activeBots.set(phoneForPair, {
              sock: sock,
              handler: commandHandler,
              pairingCode: pairingCode,
              connected: false,
              authDir: authDir
            });
          }
        } catch (error) {
          console.error(`❌ Failed to get pairing code for ${phoneForPair}:`, error.message);
          console.error(`Error details:`, error);
          
          // Update with failure
          if (activeBots.has(phoneForPair)) {
            const botData = activeBots.get(phoneForPair);
            botData.pairingCode = "FAILED";
            activeBots.set(phoneForPair, botData);
          }
        }
      }, 5000); // Increased delay to 5 seconds
    } else if (sock.authState.creds.registered) {
      console.log(`📱 Bot for ${phoneForPair} is already registered`);
      
      activeBots.set(phoneForPair, {
        sock: sock,
        handler: commandHandler,
        pairingCode: null,
        connected: true,
        authDir: authDir
      });
      
      connectionAttempts.delete(phoneForPair);
    }

    /* ===================== MESSAGE HANDLER ===================== */
    sock.ev.on("messages.upsert", async ({ messages }) => {
      const m = messages[0];
      if (!m?.message) return;

      try {
        await commandHandler.handleMessage(m);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });

  } catch (error) {
    console.error(`💥 CRITICAL error for ${phoneForPair}:`, error);
    connectionAttempts.delete(phoneForPair);
  }
}

/* ===================== PAIR API ===================== */
app.post("/pair", async (req, res) => {
  console.log("📬 Pair request received:", req.body);
  
  let phone = String(req.body.phone || "").trim();
  
  if (!phone) {
    console.log("❌ No phone number provided");
    return res.json({ success: false, error: "Phone number is required" });
  }
  
  // Clean and format phone number
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (cleanPhone.length < 10) {
    console.log(`❌ Invalid phone length: ${cleanPhone.length}`);
    return res.json({ success: false, error: "Invalid phone number. Must be at least 10 digits." });
  }
  
  // Format with country code
  let formattedPhone = cleanPhone;
  if (cleanPhone.length === 10 && cleanPhone.startsWith('0')) {
    formattedPhone = '234' + cleanPhone.slice(1); // Nigeria format
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
    formattedPhone = '234' + cleanPhone.slice(1);
  } else if (cleanPhone.length === 13 && cleanPhone.startsWith('234')) {
    formattedPhone = cleanPhone; // Already in correct format
  } else if (cleanPhone.length === 12 && cleanPhone.startsWith('234')) {
    formattedPhone = cleanPhone;
  }
  
  console.log(`📱 Phone number: Original=${phone}, Clean=${cleanPhone}, Formatted=${formattedPhone}`);
  
  // Check if bot already exists and is connected
  if (activeBots.has(formattedPhone)) {
    const botData = activeBots.get(formattedPhone);
    if (botData.connected && !botData.pairingCode) {
      console.log(`ℹ️ Bot for ${formattedPhone} is already connected`);
      return res.json({ 
        success: false, 
        error: "This phone is already connected. Please disconnect first or use a different number." 
      });
    }
  }

  // Start WhatsApp for this phone
  console.log(`🚀 Initiating WhatsApp connection for ${formattedPhone}`);
  await startWhatsApp(formattedPhone);

  // Wait for pairing code with improved timeout logic
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 40; // 40 seconds timeout
    
    console.log(`⏳ Waiting for pairing code for ${formattedPhone}...`);
    
    const checkInterval = setInterval(() => {
      attempts++;
      
      console.log(`🔍 Check attempt ${attempts}/${maxAttempts} for ${formattedPhone}`);
      
      if (activeBots.has(formattedPhone)) {
        const botData = activeBots.get(formattedPhone);
        
        if (botData.pairingCode && botData.pairingCode !== "FAILED") {
          console.log(`✅ Pairing code found: ${botData.pairingCode}`);
          clearInterval(checkInterval);
          resolve(res.json({ 
            success: true, 
            code: botData.pairingCode,
            phone: formattedPhone
          }));
          return;
        }
        
        if (botData.pairingCode === "FAILED") {
          console.log(`❌ Pairing code generation failed`);
          clearInterval(checkInterval);
          resolve(res.json({ 
            success: false, 
            error: "Failed to generate pairing code. Please try again." 
          }));
          return;
        }
      }
      
      // Check connection attempts
      if (connectionAttempts.has(formattedPhone)) {
        console.log(`🔄 Connection attempt in progress for ${formattedPhone}`);
      } else {
        console.log(`⚠️ No connection attempt found for ${formattedPhone}`);
      }
      
      if (attempts >= maxAttempts) {
        console.log(`⏰ Timeout reached for ${formattedPhone}`);
        clearInterval(checkInterval);
        resolve(res.json({ 
          success: false, 
          error: "Timeout: Could not generate pairing code. Please check:\n1. Internet connection\n2. Phone number format\n3. Try again in 30 seconds" 
        }));
      }
    }, 1000);
  });
});

/* ===================== STATUS API ===================== */
app.get("/status", (req, res) => {
  const status = {
    totalBots: activeBots.size,
    activeBots: Array.from(activeBots.entries()).map(([phone, data]) => ({
      phone: phone,
      connected: data.connected || false,
      hasPairingCode: !!data.pairingCode && data.pairingCode !== "FAILED",
      authDir: data.authDir || 'N/A'
    })),
    connectionAttempts: Array.from(connectionAttempts.entries()),
    serverTime: new Date().toISOString(),
    serverUptime: process.uptime()
  };
  
  console.log("📊 Status check:", status);
  res.json(status);
});

/* ===================== DEBUG API ===================== */
app.get("/debug", (req, res) => {
  const debugInfo = {
    nodeVersion: process.version,
    platform: process.platform,
    memoryUsage: process.memoryUsage(),
    activeBots: activeBots.size,
    authDirs: fs.readdirSync('./').filter(dir => dir.startsWith('auth_')),
    serverTime: new Date().toISOString()
  };
  
  res.json(debugInfo);
});

/* ===================== DISCONNECT API ===================== */
app.post("/disconnect", (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, '');
  
  console.log(`🔌 Disconnect request for: ${phone}`);
  
  if (activeBots.has(phone)) {
    const botData = activeBots.get(phone);
    
    try {
      // Close the socket connection
      if (botData.sock && botData.sock.ws) {
        botData.sock.ws.close();
      }
      
      activeBots.delete(phone);
      connectionAttempts.delete(phone);
      
      console.log(`✅ Successfully disconnected bot for ${phone}`);
      
      res.json({ 
        success: true, 
        message: `Bot for ${phone} disconnected successfully` 
      });
    } catch (error) {
      console.error(`❌ Error disconnecting ${phone}:`, error);
      res.json({ 
        success: false, 
        error: `Failed to disconnect: ${error.message}` 
      });
    }
  } else {
    console.log(`⚠️ No active bot found for ${phone}`);
    res.json({ 
      success: false, 
      error: "Bot not found for this phone" 
    });
  }
});

/* ===================== CLEANUP API ===================== */
app.post("/cleanup", (req, res) => {
  try {
    // Disconnect all bots
    for (const [phone, botData] of activeBots.entries()) {
      try {
        if (botData.sock && botData.sock.ws) {
          botData.sock.ws.close();
        }
      } catch (error) {
        console.error(`Error disconnecting ${phone}:`, error);
      }
    }
    
    // Clear all maps
    activeBots.clear();
    connectionAttempts.clear();
    
    console.log("🧹 Cleanup completed");
    
    res.json({ 
      success: true, 
      message: "All bots disconnected and cleanup completed" 
    });
  } catch (error) {
    res.json({ 
      success: false, 
      error: `Cleanup failed: ${error.message}` 
    });
  }
});

/* ===================== START ===================== */
app.listen(PORT, () => {
  console.log(`🚀 Viral-Bot Mini Server Started`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔧 Debug: http://localhost:${PORT}/debug`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
  console.log(`📱 Pairing: POST http://localhost:${PORT}/pair`);
  console.log(`🔌 Disconnect: POST http://localhost:${PORT}/disconnect`);
  console.log(`🧹 Cleanup: POST http://localhost:${PORT}/cleanup`);
  
  // Load any previously connected bots
  const authDirs = fs.readdirSync('./').filter(dir => dir.startsWith('auth_'));
  
  console.log(`📂 Found ${authDirs.length} auth directories:`, authDirs);
  
  authDirs.forEach(dir => {
    const phone = dir.replace('auth_', '');
    if (fs.existsSync(`./${dir}/creds.json`)) {
      console.log(`📱 Found existing auth for: ${phone}`);
      // Auto-connect saved sessions
      setTimeout(() => {
        console.log(`🔗 Attempting to reconnect saved session for ${phone}`);
        startWhatsApp(phone);
      }, 5000);
    }
  });
});

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('🛑 Server shutting down...');
  
  // Disconnect all bots
  for (const [phone, botData] of activeBots.entries()) {
    try {
      if (botData.sock && botData.sock.ws) {
        botData.sock.ws.close();
      }
      console.log(`✅ Disconnected bot for ${phone}`);
    } catch (error) {
      console.error(`❌ Error disconnecting ${phone}:`, error);
    }
  }
  
  console.log('👋 Server shutdown complete');
  process.exit(0);
});