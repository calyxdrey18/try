// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
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

/* ===================== GLOBAL STATE ===================== */
let activeBots = new Map(); // Map to store multiple bot instances: phone -> {sock, handler, pairingCode}
let isStarting = false;

/* ===================== WHATSAPP CORE ===================== */
async function startWhatsApp(phoneForPair) {
  if (isStarting) return;
  isStarting = true;

  try {
    // Create unique directory for this phone number's auth
    const authDir = `./auth_${phoneForPair.replace(/\D/g, '')}`;
    
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("Chrome"),
      printQRInTerminal: false
    });

    // Create unique bot ID
    const botId = `bot_${phoneForPair}`;
    
    // Initialize command handler for this bot
    const commandHandler = new CommandHandler(sock, botId);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (u) => {
      const { connection, lastDisconnect } = u;

      if (connection === "open") {
        console.log(`✅ WhatsApp Connected for ${phoneForPair}`);
        
        // Store bot instance
        activeBots.set(phoneForPair, {
          sock: sock,
          handler: commandHandler,
          pairingCode: null,
          connected: true
        });
        
        isStarting = false;
      }

      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        console.log(`❌ Disconnected for ${phoneForPair}. Reconnect:`, shouldReconnect);
        
        // Remove from active bots
        activeBots.delete(phoneForPair);
        isStarting = false;
        
        if (shouldReconnect) {
          setTimeout(() => startWhatsApp(phoneForPair), 5000);
        }
      }
    });

    // Pairing code request
    if (phoneForPair && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const pairingCode = await sock.requestPairingCode(phoneForPair);
          console.log(`🔐 Pairing Code for ${phoneForPair}:`, pairingCode);
          
          // Update pairing code in active bots
          if (activeBots.has(phoneForPair)) {
            const botData = activeBots.get(phoneForPair);
            botData.pairingCode = pairingCode;
            activeBots.set(phoneForPair, botData);
          }
        } catch (error) {
          console.error(`Failed to get pairing code for ${phoneForPair}:`, error);
          
          if (activeBots.has(phoneForPair)) {
            const botData = activeBots.get(phoneForPair);
            botData.pairingCode = "FAILED";
            activeBots.set(phoneForPair, botData);
          }
        }
      }, 3000);
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

    // Check if already registered
    if (sock.authState.creds.registered) {
      console.log(`📱 Bot for ${phoneForPair} is already registered`);
      
      activeBots.set(phoneForPair, {
        sock: sock,
        handler: commandHandler,
        pairingCode: null,
        connected: true
      });
    }

  } catch (e) {
    console.error("CRITICAL:", e);
    isStarting = false;
  }
}

/* ===================== PAIR API ===================== */
app.post("/pair", async (req, res) => {
  let phone = String(req.body.phone || "").replace(/\D/g, "");
  if (!phone || phone.length < 10) {
    return res.json({ success: false, error: "Invalid phone number" });
  }

  // Format phone with country code if not present
  if (!phone.startsWith('234') && phone.length === 10) {
    phone = '234' + phone.slice(1);
  }

  console.log(`🔧 Starting WhatsApp for phone: ${phone}`);

  // Check if bot already exists for this phone
  if (activeBots.has(phone)) {
    const botData = activeBots.get(phone);
    if (botData.connected) {
      return res.json({ 
        success: false, 
        error: "This phone is already connected" 
      });
    }
  }

  // Start WhatsApp for this phone
  await startWhatsApp(phone);

  // Wait for pairing code
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds timeout

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      attempts++;
      
      if (activeBots.has(phone)) {
        const botData = activeBots.get(phone);
        
        if (botData.pairingCode) {
          clearInterval(checkInterval);
          resolve(res.json({ 
            success: true, 
            code: botData.pairingCode 
          }));
          return;
        }
        
        if (botData.pairingCode === "FAILED") {
          clearInterval(checkInterval);
          resolve(res.json({ 
            success: false, 
            error: "Failed to generate pairing code" 
          }));
          return;
        }
      }
      
      if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        resolve(res.json({ 
          success: false, 
          error: "Timeout: Could not generate pairing code" 
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
      connected: data.connected,
      hasPairingCode: !!data.pairingCode
    })),
    serverTime: new Date().toISOString()
  };
  
  res.json(status);
});

/* ===================== DISCONNECT API ===================== */
app.post("/disconnect", (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "");
  
  if (activeBots.has(phone)) {
    const botData = activeBots.get(phone);
    
    try {
      // Close the socket connection
      botData.sock.ws.close();
      activeBots.delete(phone);
      
      res.json({ 
        success: true, 
        message: `Bot for ${phone} disconnected successfully` 
      });
    } catch (error) {
      res.json({ 
        success: false, 
        error: `Failed to disconnect: ${error.message}` 
      });
    }
  } else {
    res.json({ 
      success: false, 
      error: "Bot not found for this phone" 
    });
  }
});

/* ===================== START ===================== */
app.listen(PORT, () => {
  console.log(`🚀 Viral-Bot Mini running on port ${PORT}`);
  console.log(`📱 Multiple account support enabled`);
  console.log(`🔗 Pairing endpoint: http://localhost:${PORT}`);
  
  // Load any previously connected bots
  const authDirs = fs.readdirSync('./').filter(dir => dir.startsWith('auth_'));
  
  authDirs.forEach(dir => {
    const phone = dir.replace('auth_', '');
    if (fs.existsSync(`./${dir}/creds.json`)) {
      console.log(`📂 Found existing auth for: ${phone}`);
      // Optionally auto-connect saved sessions
      // startWhatsApp(phone);
    }
  });
});