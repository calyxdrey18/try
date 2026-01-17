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
app.use(express.urlencoded({ extended: true }));

app.get("/", (_, res) =>
  res.sendFile(path.join(__dirname, "index.html"))
);

/* ===================== GLOBAL STATE ===================== */
let sock = null;
let pairingCode = null;
let isStarting = false;
let commandHandler = null;

/* ===================== WHATSAPP CORE ===================== */
async function startWhatsApp(phoneForPair = null) {
  if (isStarting) {
    console.log("⚠️ WhatsApp is already starting...");
    return;
  }
  
  isStarting = true;

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
      syncFullHistory: false,
      connectTimeoutMs: 60000
    });

    // Initialize command handler
    commandHandler = new CommandHandler(sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        console.log("✅ WhatsApp Connected Successfully!");
        pairingCode = null;
        isStarting = false;
        
        // Set bot status
        await sock.updateProfileStatus("Viral-Bot Mini 🚀 Online");
        console.log("🤖 Bot is now online and ready to receive commands!");
      }

      if (connection === "close") {
        console.log("❌ Connection closed");
        isStarting = false;
        
        const shouldReconnect = 
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut &&
          lastDisconnect?.error?.output?.statusCode !== 401;
        
        console.log("🔄 Should reconnect:", shouldReconnect);
        
        if (shouldReconnect) {
          console.log("🔄 Reconnecting in 5 seconds...");
          setTimeout(() => startWhatsApp(), 5000);
        } else {
          console.log("❌ Not reconnecting - logged out or fatal error");
        }
      }
    });

    // Pairing code request
    if (phoneForPair && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          console.log(`📞 Requesting pairing code for: ${phoneForPair}`);
          pairingCode = await sock.requestPairingCode(phoneForPair);
          console.log("🔐 Pairing Code:", pairingCode);
        } catch (error) {
          console.error("❌ Failed to get pairing code:", error);
          pairingCode = "FAILED";
        }
      }, 5000);
    }

    /* ===================== MESSAGE HANDLER ===================== */
    sock.ev.on("messages.upsert", async (data) => {
      const { messages } = data;
      const m = messages[0];
      
      if (!m?.message || m.key.fromMe) return;

      try {
        await commandHandler.handleMessage(m);
      } catch (error) {
        console.error("❌ Error handling message:", error);
      }
    });

    // Handle group participants update for welcome messages
    sock.ev.on("group-participants.update", async (update) => {
      try {
        const { id, participants, action } = update;
        const settings = commandHandler.groupSettings.get(id);
        
        if (settings?.welcome && action === "add") {
          for (const participant of participants) {
            await sock.sendMessage(id, {
              text: `🎉 Welcome @${participant.split('@')[0]} to the group!\n\nType .menu to see available commands.`,
              mentions: [participant]
            });
          }
        }
      } catch (error) {
        console.error("Error in group participants update:", error);
      }
    });

  } catch (error) {
    console.error("❌ CRITICAL ERROR starting WhatsApp:", error);
    isStarting = false;
    throw error;
  }
}

/* ===================== PAIR API ===================== */
app.post("/pair", async (req, res) => {
  try {
    let phone = String(req.body.phone || "").replace(/\D/g, "");
    
    if (!phone || phone.length < 10) {
      return res.json({ 
        success: false, 
        error: "Invalid phone number format. Minimum 10 digits required." 
      });
    }

    // Format phone number properly for Nigeria
    if (phone.length === 10 && phone.startsWith("0")) {
      phone = "234" + phone.substring(1);
    } else if (phone.length === 11 && phone.startsWith("0")) {
      phone = "234" + phone.substring(1);
    } else if (phone.length === 13 && phone.startsWith("234")) {
      // Already formatted correctly
    } else {
      return res.json({ 
        success: false, 
        error: "Please use format: 2348012345678 (Nigeria)" 
      });
    }

    console.log(`🔗 Pairing request for: ${phone}`);
    
    pairingCode = null;
    await startWhatsApp(phone);

    let attempts = 0;
    const maxAttempts = 30;
    
    const checkCode = setInterval(() => {
      attempts++;
      
      if (pairingCode && pairingCode !== "FAILED") {
        clearInterval(checkCode);
        const formattedCode = pairingCode.match(/.{1,4}/g)?.join(" ") || pairingCode;
        return res.json({ 
          success: true, 
          code: pairingCode,
          formatted: formattedCode
        });
      }
      
      if (pairingCode === "FAILED") {
        clearInterval(checkCode);
        return res.json({ 
          success: false, 
          error: "Failed to generate pairing code. Try again." 
        });
      }
      
      if (attempts >= maxAttempts) {
        clearInterval(checkCode);
        return res.json({ 
          success: false, 
          error: "Timeout - Could not generate pairing code after 30 seconds" 
        });
      }
    }, 1000);

  } catch (error) {
    console.error("Pairing error:", error);
    res.json({ 
      success: false, 
      error: "Internal server error. Check console for details." 
    });
  }
});

/* ===================== HEALTH CHECK ===================== */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot_connected: sock ? true : false,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/* ===================== START SERVER ===================== */
app.listen(PORT, () => {
  console.log(`🚀 Viral-Bot Mini running on port ${PORT}`);
  console.log(`🌐 Web Interface: http://localhost:${PORT}`);
  console.log(`📱 Use the web interface to pair your WhatsApp number`);
  
  // Check if auth exists and start WhatsApp
  const authPath = "./auth/creds.json";
  if (fs.existsSync(authPath)) {
    console.log("🔑 Found existing auth, starting WhatsApp...");
    setTimeout(() => startWhatsApp(), 2000);
  } else {
    console.log("🔒 No auth found - waiting for pairing via web interface");
  }
});