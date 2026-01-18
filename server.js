// server.js - Fixed for Render
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
      markOnlineOnConnect: true
    });

    commandHandler = new CommandHandler(sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        console.log("✅ WhatsApp Connected");
        pairingCode = null;
        isStarting = false;
        
        // Update bot status
        sock.updateProfileStatus("Viral-Bot Mini 🚀 Online").catch(() => {});
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
        
        console.log("❌ Disconnected. Reconnect:", shouldReconnect);
        isStarting = false;
        
        if (shouldReconnect) {
          setTimeout(() => startWhatsApp(), 5000);
        }
      }
    });

    // Pairing code
    if (phoneForPair && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          pairingCode = await sock.requestPairingCode(phoneForPair);
          console.log("🔐 Pairing Code:", pairingCode);
        } catch {
          pairingCode = "FAILED";
        }
      }, 5000);
    }

    // Message handler
    sock.ev.on("messages.upsert", async (data) => {
      const m = data.messages[0];
      if (!m?.message || m.key.fromMe) return;

      try {
        await commandHandler.handleMessage(m);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });

  } catch (e) {
    console.error("Start error:", e);
    isStarting = false;
  }
}

// Pair API
app.post("/pair", async (req, res) => {
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

  console.log(`Pairing: ${phone}`);
  pairingCode = null;
  await startWhatsApp(phone);

  let attempts = 0;
  const wait = setInterval(() => {
    attempts++;
    if (pairingCode) {
      clearInterval(wait);
      return res.json({ success: true, code: pairingCode });
    }
    if (pairingCode === "FAILED") {
      clearInterval(wait);
      return res.json({ success: false, error: "Pairing failed" });
    }
    if (attempts > 30) {
      clearInterval(wait);
      return res.json({ success: false, error: "Timeout" });
    }
  }, 1000);
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    bot: sock ? true : false,
    uptime: process.uptime() 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Web: http://localhost:${PORT}`);
  
  if (fs.existsSync("./auth/creds.json")) {
    console.log("🔑 Starting WhatsApp...");
    setTimeout(() => startWhatsApp(), 2000);
  } else {
    console.log("🔒 Use web interface to pair");
  }
});