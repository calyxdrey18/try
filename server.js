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

let sock;
let pairingCode = null;
let isStarting = false;

/* ===================== WHATSAPP CORE ===================== */
async function startWhatsApp(phoneForPair = null) {
  if (isStarting) return;
  isStarting = true;

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
      const reason =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("❌ Disconnected. Reconnect:", reason);
      isStarting = false;
      if (reason) startWhatsApp();
    }
  });

  // WAIT before requesting pair code
  if (phoneForPair && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        pairingCode = await sock.requestPairingCode(phoneForPair);
        console.log("🔐 Pair Code:", pairingCode);
      } catch (e) {
        console.error("Pair error:", e.message);
        pairingCode = "FAILED";
      }
    }, 3000);
  }

  /* ===================== COMMAND HANDLER ===================== */
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const jid = m.key.remoteJid;
    const type = Object.keys(m.message)[0];
    const text =
      type === "conversation"
        ? m.message.conversation
        : type === "extendedTextMessage"
        ? m.message.extendedTextMessage.text
        : "";

    if (!text?.startsWith(".")) return;

    const cmd = text.slice(1).toLowerCase();

    if (cmd === "ping")
      return sock.sendMessage(jid, { text: "🏓 Pong!" });

    if (cmd === "hi")
      return sock.sendMessage(jid, { text: "Hello 👋 Viral-Bot Mini online" });

    if (cmd === "help")
      return sock.sendMessage(jid, {
        text: "*Viral-Bot Mini*\n\n.ping\n.hi\n.help"
      });
  });
}

/* ===================== PAIR API ===================== */
app.post("/pair", async (req, res) => {
  let phone = String(req.body.phone || "").replace(/\D/g, "");
  if (!phone) return res.json({ success: false, error: "Invalid phone" });

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
  console.log("🚀 Server running on", PORT);
  if (fs.existsSync("./auth/creds.json")) startWhatsApp();
});
