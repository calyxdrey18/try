// server.js - Fixed message handling
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
app.use(express.urlencoded({ extended: true }));

app.get("/", (_, res) =>
  res.sendFile(path.join(__dirname, "index.html"))
);

let sock = null;
let pairingCode = null;
let isStarting = false;
let commandHandler = null;
let isConnected = false;

async function startWhatsApp(phoneForPair = null) {
  if (isStarting) {
    console.log("⚠️ WhatsApp is already starting...");
    return;
  }
  
  isStarting = true;
  console.log("🚀 Starting WhatsApp connection...");

  try {
    const { state, saveCreds } = await useMultiFileAuthState("./auth");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("Chrome"),
      printQRInTerminal: false,
      markOnlineOnConnect: true,
      emitOwnEvents: true,
      syncFullHistory: false
    });

    // Initialize command handler
    commandHandler = new CommandHandler(sock);
    console.log("✅ Command handler initialized");

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      console.log("📡 Connection update:", connection);

      if (connection === "open") {
        console.log("✅ WhatsApp Connected Successfully!");
        pairingCode = null;
        isStarting = false;
        isConnected = true;
        
        // Get bot info
        const user = sock.user;
        console.log("🤖 Bot User ID:", user?.id);
        console.log("🤖 Bot Name:", user?.name);
        
        // Set bot status
        try {
          await sock.updateProfileStatus("Viral-Bot Mini 🚀 Online");
          console.log("📝 Bot status updated");
        } catch (error) {
          console.log("⚠️ Could not update status:", error.message);
        }
      }

      if (connection === "close") {
        console.log("❌ Connection closed");
        isStarting = false;
        isConnected = false;
        
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log("🔄 Should reconnect:", shouldReconnect);
        
        if (shouldReconnect) {
          console.log("🔄 Reconnecting in 5 seconds...");
          setTimeout(() => startWhatsApp(), 5000);
        }
      }
    });

    // Pairing code
    if (phoneForPair && sock.authState && !sock.authState.creds.registered) {
      console.log(`📞 Requesting pairing code for: ${phoneForPair}`);
      
      setTimeout(async () => {
        try {
          pairingCode = await sock.requestPairingCode(phoneForPair);
          console.log("🔐 Pairing Code:", pairingCode);
        } catch (err) {
          console.error("❌ Pairing error:", err.message);
          pairingCode = "FAILED";
        }
      }, 3000);
    }

    /* ========== MESSAGE HANDLER ========== */
    sock.ev.on("messages.upsert", async (data) => {
      try {
        const { messages, type } = data;
        
        // Only process notify messages (new messages)
        if (type !== 'notify') {
          console.log("📨 Skipping message type:", type);
          return;
        }

        for (const m of messages) {
          // Skip if no message content
          if (!m.message) {
            console.log("📭 Empty message");
            continue;
          }

          // Skip bot's own messages
          if (m.key.fromMe) {
            console.log("🤖 Skipping own message");
            continue;
          }

          console.log("📩 New message from:", m.key.remoteJid);
          console.log("📊 Message type:", Object.keys(m.message)[0]);
          
          // Process message
          await commandHandler.handleMessage(m);
        }
      } catch (error) {
        console.error("❌ Error in message handler:", error.message);
        console.error("Stack:", error.stack);
      }
    });

    // Connection errors
    sock.ev.on("connection.update", (update) => {
      if (update.qr) {
        console.log("📱 QR Code generated");
      }
      
      if (update.connection === "connecting") {
        console.log("🔄 Connecting to WhatsApp...");
      }
    });

  } catch (e) {
    console.error("❌ CRITICAL START ERROR:", e.message);
    console.error("Stack:", e.stack);
    isStarting = false;
    isConnected = false;
  }
}

// Pair API
app.post("/pair", async (req, res) => {
  try {
    let phone = String(req.body.phone || "").replace(/\D/g, "");
    
    if (!phone || phone.length < 10) {
      return res.json({ success: false, error: "Invalid phone number" });
    }

    // Format for Nigeria
    if (phone.length === 10 && phone.startsWith("0")) {
      phone = "234" + phone.substring(1);
    } else if (phone.length === 11 && phone.startsWith("0")) {
      phone = "234" + phone.substring(1);
    }

    console.log(`🔗 Pairing request for: ${phone}`);
    pairingCode = null;
    
    // Start WhatsApp
    await startWhatsApp(phone);

    // Wait for pairing code
    let attempts = 0;
    const maxAttempts = 30;
    
    const waitInterval = setInterval(() => {
      attempts++;
      
      if (pairingCode && pairingCode !== "FAILED") {
        clearInterval(waitInterval);
        const formatted = pairingCode.match(/.{1,4}/g)?.join(" ") || pairingCode;
        return res.json({ 
          success: true, 
          code: pairingCode,
          formatted: formatted
        });
      }
      
      if (pairingCode === "FAILED") {
        clearInterval(waitInterval);
        return res.json({ success: false, error: "Pairing failed" });
      }
      
      if (attempts >= maxAttempts) {
        clearInterval(waitInterval);
        return res.json({ success: false, error: "Timeout" });
      }
    }, 1000);
    
  } catch (error) {
    console.error("Pair API error:", error);
    res.json({ success: false, error: "Server error" });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    bot_connected: isConnected,
    whatsapp_ready: sock ? true : false,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Bot status
app.get("/status", (req, res) => {
  res.json({
    connected: isConnected,
    user: sock?.user?.id || null,
    name: sock?.user?.name || null,
    commands_processed: commandHandler?.stats?.commandsExecuted || 0
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Viral-Bot Mini Server started on port ${PORT}`);
  console.log(`🌐 Web Interface: http://localhost:${PORT}`);
  console.log(`📱 Use web interface to pair your WhatsApp`);
  
  // Check for existing auth
  const authPath = "./auth/creds.json";
  if (fs.existsSync(authPath)) {
    console.log("🔑 Found existing auth, starting WhatsApp...");
    setTimeout(() => {
      startWhatsApp();
    }, 2000);
  } else {
    console.log("🔒 No auth found - waiting for pairing");
  }
});