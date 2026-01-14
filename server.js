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
let sock = null;
let pairingCode = null;
let isStarting = false;
let commandHandler = null;

/* ===================== WHATSAPP CORE ===================== */
async function startWhatsApp(phoneForPair = null) {
  if (isStarting) return;
  isStarting = true;

  try {
    console.log("🔄 Initializing WhatsApp connection...");
    
    const { state, saveCreds } = await useMultiFileAuthState("./auth");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("Chrome"),
      printQRInTerminal: true
    });

    // Initialize command handler
    commandHandler = new CommandHandler(sock);
    console.log("✅ Command handler initialized");

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (u) => {
      const { connection, lastDisconnect, qr } = u;

      if (qr) {
        console.log("📱 QR Code generated for pairing");
      }

      if (connection === "open") {
        console.log("✅ WhatsApp Connected Successfully");
        pairingCode = null;
        isStarting = false;
        
        // Send startup notification
        try {
          const botJid = sock.user.id;
          sock.sendMessage(botJid, {
            text: "🤖 *Viral-Bot Mini Started*\n\nBot is now online and ready!\nType `.menu` to see all commands."
          });
        } catch (e) {
          console.log("Startup message error:", e.message);
        }
      }

      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        console.log("❌ Disconnected. Reconnect:", shouldReconnect);
        isStarting = false;
        if (shouldReconnect) {
          console.log("🔄 Reconnecting in 5 seconds...");
          setTimeout(() => startWhatsApp(), 5000);
        }
      }
    });

    // Pairing code request
    if (phoneForPair && sock.authState?.creds && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          pairingCode = await sock.requestPairingCode(phoneForPair);
          console.log("🔐 Pairing Code:", pairingCode);
        } catch (error) {
          console.error("❌ Pairing failed:", error.message);
          pairingCode = "FAILED";
        }
      }, 3000);
    }

    /* ===================== MESSAGE HANDLER ===================== */
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      
      const m = messages[0];
      if (!m?.message || m.key?.fromMe) return;

      try {
        await commandHandler.handleMessage(m);
      } catch (error) {
        console.error("❌ Error handling message:", error.message);
      }
    });

  } catch (e) {
    console.error("❌ CRITICAL ERROR:", e);
    isStarting = false;
    
    // Attempt restart
    setTimeout(() => {
      console.log("🔄 Attempting to restart...");
      startWhatsApp();
    }, 10000);
  }
}

/* ===================== PAIR API ===================== */
app.post("/pair", async (req, res) => {
  let phone = String(req.body.phone || "").replace(/\D/g, "");
  if (!phone)
    return res.json({ success: false, error: "Invalid phone number" });

  pairingCode = null;
  await startWhatsApp(phone);

  let t = 0;
  const wait = setInterval(() => {
    t++;
    if (pairingCode) {
      clearInterval(wait);
      return res.json({ success: true, code: pairingCode });
    }
    if (t > 30) {
      clearInterval(wait);
      return res.json({ 
        success: false, 
        error: "Timeout. Please check phone number and try again." 
      });
    }
  }, 1000);
});

/* ===================== HEALTH CHECK ===================== */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot_connected: sock ? "connected" : "disconnected",
    pairing_code: pairingCode || "none",
    uptime: process.uptime()
  });
});

/* ===================== START SERVER ===================== */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Viral-Bot Mini running on port ${PORT}`);
  console.log(`🌐 Web Interface: http://localhost:${PORT}`);
  
  if (fs.existsSync("./auth/creds.json")) {
    console.log("🔄 Restoring previous session...");
    setTimeout(() => startWhatsApp(), 2000);
  } else {
    console.log("📱 No previous session found. Ready for pairing.");
  }
});