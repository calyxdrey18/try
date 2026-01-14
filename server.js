
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
      keepAliveIntervalMs: 10000
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
    sock.ev.on("messages.upsert", async ({ messages }) => {
      const m = messages[0];
      if (!m?.message) return;

      try {
        // Process message immediately
        await commandHandler.handleMessage(m);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });

  } catch (e) {
    console.error("CRITICAL:", e);
    isStarting = false;
    setTimeout(() => startWhatsApp(), 10000);
  }
}

/* ===================== PAIR API ===================== */
app.post("/pair", async (req, res) => {
  let phone = String(req.body.phone || "").replace(/\D/g, "");
  if (!phone)
    return res.json({ success: false, error: "Invalid phone" });

  pairingCode = null;
  await startWhatsApp(phone);

  let t = 0;
  const wait = setInterval(() => {
    t++;
    if (pairingCode) {
      clearInterval(wait);
      return res.json({ success: true, code: pairingCode });
    }
    if (t > 25) {
      clearInterval(wait);
      return res.json({ success: false, error: "Timeout" });
    }
  }, 1000);
});

/* ===================== START ===================== */
app.listen(PORT, () => {
  console.log(`🚀 Viral-Bot Mini running on port ${PORT}`);
  if (fs.existsSync("./auth/creds.json")) startWhatsApp();
});
