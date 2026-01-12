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
      printQRInTerminal: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (u) => {
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
        if (shouldReconnect) startWhatsApp();
      }
    });

    // 🔐 REQUEST PAIR CODE (SAFE)
    if (phoneForPair && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          pairingCode = await sock.requestPairingCode(phoneForPair);
          console.log("🔐 Pairing Code:", pairingCode);
        } catch (e) {
          console.error("Pairing failed:", e.message);
          pairingCode = "FAILED";
        }
      }, 3000);
    }

    /* ===================== MESSAGE HANDLER ===================== */
    sock.ev.on("messages.upsert", async ({ messages }) => {
      const m = messages[0];
      if (!m?.message) return;

      const jid = m.key.remoteJid;

      // Ignore WhatsApp status & system messages
      if (jid === "status@broadcast") return;

      // Extract text
      const type = Object.keys(m.message)[0];
      const text =
        type === "conversation"
          ? m.message.conversation
          : type === "extendedTextMessage"
          ? m.message.extendedTextMessage.text
          : "";

      if (!text || !text.startsWith(".")) return;

      // 🛑 Prevent loops (ignore bot's own sent replies)
      const isBotEcho =
        m.key.fromMe &&
        m.message.extendedTextMessage?.contextInfo?.stanzaId;

      if (isBotEcho) return;

      const command = text.slice(1).toLowerCase();

      console.log("CMD:", command, "| fromMe:", m.key.fromMe);

      switch (command) {
        case "ping":
          await sock.sendMessage(jid, { text: "🏓 Pong!" });
          break;

        case "hi":
          await sock.sendMessage(jid, {
            text: "Hello 👋 Viral-Bot Mini is online"
          });
          break;

        case "menu":
          await sock.sendMessage(jid, {
            text: `*Viral-Bot Mini Menu*

.ping  – check status
.hi    – greeting
.menu  – show commands
.help  – help info`
          });
          break;

        case "help":
          await sock.sendMessage(jid, {
            text: "Use `.menu` to see available commands"
          });
          break;
      }
    });

  } catch (err) {
    console.error("CRITICAL ERROR:", err);
    isStarting = false;
  }
}

/* ===================== PAIR API ===================== */
app.post("/pair", async (req, res) => {
  let phone = String(req.body.phone || "").replace(/\D/g, "");
  if (!phone)
    return res.json({ success: false, error: "Invalid phone number" });

  pairingCode = null;
  await startWhatsApp(phone);

  let tries = 0;
  const wait = setInterval(() => {
    tries++;
    if (pairingCode) {
      clearInterval(wait);
      return res.json({ success: true, code: pairingCode });
    }
    if (tries > 25) {
      clearInterval(wait);
      return res.json({ success: false, error: "Timeout" });
    }
  }, 1000);
});

/* ===================== START SERVER ===================== */
app.listen(PORT, () => {
  console.log("🚀 Viral-Bot Mini running on port", PORT);
  if (fs.existsSync("./auth/creds.json")) startWhatsApp();
});
