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
let sock = null;
let pairingCode = null;
let isStarting = false;
let commandHandler = null;

/* ===================== WHATSAPP CORE ===================== */
async function startWhatsApp(phoneForPair = null) {
  if (isStarting) return;
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
      syncFullHistory: false,
      markOnlineOnConnect: true,
      emitOwnEvents: true,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 10000,
      generateHighQualityLinkPreview: true,
      retryRequestDelayMs: 1000,
      getMessage: async (key) => {
        return {};
      }
    });

    // Initialize command handler
    commandHandler = new CommandHandler(sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (u) => {
      const { connection, lastDisconnect } = u;

      if (connection === "open") {
        console.log("✅ WhatsApp Connected");
        pairingCode = null;
        isStarting = false;
        
        // Mark bot as online
        sock.sendPresenceUpdate('available');
        
        // Set status
        sock.updateProfileStatus("Viral-Bot Mini is Online 🤖");
      }

      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        console.log("❌ Disconnected. Reconnect:", shouldReconnect);
        isStarting = false;
        sock = null;
        if (shouldReconnect) {
          console.log("🔄 Reconnecting in 5 seconds...");
          setTimeout(() => startWhatsApp(), 5000);
        }
      }
    });

    // Pairing code request
    if (phoneForPair && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          pairingCode = await sock.requestPairingCode(phoneForPair);
          console.log("🔐 Pairing Code:", pairingCode);
        } catch {
          pairingCode = "FAILED";
        }
      }, 3000);
    }

    /* ===================== MESSAGE HANDLER ===================== */
    sock.ev.on("messages.upsert", async (data) => {
      const { messages, type } = data;
      
      if (type !== 'notify') return;
      
      for (const m of messages) {
        if (!m?.message) continue;
        
        // Skip if message is from status broadcast
        if (m.key.remoteJid === "status@broadcast") continue;
        
        // Mark message as read
        try {
          await sock.readMessages([m.key]);
        } catch (error) {
          console.error("Error marking message as read:", error);
        }
        
        // Process message asynchronously
        try {
          await commandHandler.handleMessage(m);
        } catch (error) {
          console.error("Error handling message:", error);
        }
      }
    });

    // Handle group participants update
    sock.ev.on("group-participants.update", async (update) => {
      try {
        const { id, participants, action } = update;
        
        // Get group settings
        if (commandHandler.groupSettings.has(id)) {
          const settings = commandHandler.groupSettings.get(id);
          
          if (settings.welcome) {
            // Send welcome message for new participants
            if (action === "add") {
              for (const participant of participants) {
                await sock.sendMessage(id, {
                  text: `🎉 Welcome @${participant.split('@')[0]} to the group!\n\nPlease read the group rules and enjoy your stay!`,
                  mentions: [participant]
                });
              }
            }
          }
        }
      } catch (error) {
        console.error("Error handling group update:", error);
      }
    });

  } catch (e) {
    console.error("CRITICAL ERROR:", e);
    isStarting = false;
    sock = null;
    setTimeout(() => startWhatsApp(), 10000);
  }
}

/* ===================== PAIR API ===================== */
app.post("/pair", async (req, res) => {
  let phone = String(req.body.phone || "").replace(/\D/g, "");
  if (!phone)
    return res.json({ success: false, error: "Invalid phone" });

  pairingCode = null;
  
  // Stop any existing connection
  if (sock) {
    try {
      await sock.logout();
      sock = null;
    } catch (error) {
      // Ignore logout errors
    }
  }
  
  await startWhatsApp(phone);

  let attempts = 0;
  const maxAttempts = 30;
  
  const waitForCode = setInterval(() => {
    attempts++;
    
    if (pairingCode) {
      clearInterval(waitForCode);
      return res.json({ 
        success: true, 
        code: pairingCode,
        message: "Pairing code generated successfully"
      });
    }
    
    if (attempts > maxAttempts) {
      clearInterval(waitForCode);
      return res.json({ 
        success: false, 
        error: "Timeout waiting for pairing code. Please try again." 
      });
    }
  }, 1000);
});

/* ===================== HEALTH CHECK ===================== */
app.get("/health", (req, res) => {
  const status = {
    bot_connected: sock !== null,
    pairing_code: pairingCode || "Not active",
    is_starting: isStarting,
    timestamp: new Date().toISOString()
  };
  res.json(status);
});

/* ===================== START ===================== */
app.listen(PORT, () => {
  console.log(`🚀 Viral-Bot Mini running on port ${PORT}`);
  console.log(`🌐 Web Interface: http://localhost:${PORT}`);
  
  // Check if credentials exist and start bot
  if (fs.existsSync("./auth/creds.json")) {
    console.log("🔑 Credentials found, starting bot...");
    startWhatsApp();
  } else {
    console.log("🔒 No credentials found. Please pair via web interface.");
  }
});