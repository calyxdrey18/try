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
        if (shouldReconnect) startWhatsApp();
      }
    });

    // 🔐 Pairing code
    if (phoneForPair && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          pairingCode = await sock.requestPairingCode(phoneForPair);
          console.log("🔐 Pair Code:", pairingCode);
        } catch {
          pairingCode = "FAILED";
        }
      }, 3000);
    }

    /* ===================== MESSAGE HANDLER ===================== */
    sock.ev.on("messages.upsert", async ({ messages }) => {
      const m = messages[0];
      if (!m?.message) return;

      const jid = m.key.remoteJid;
      if (jid === "status@broadcast") return;

      const isGroup = jid.endsWith("@g.us");

      // 🔑 FIXED sender detection
      const sender = isGroup
        ? m.key.participant || m.key.remoteJid
        : jid;

      const type = Object.keys(m.message)[0];
      const text =
        type === "conversation"
          ? m.message.conversation
          : type === "extendedTextMessage"
          ? m.message.extendedTextMessage.text
          : "";

      if (!text || !text.startsWith(".")) return;

      // 🛑 prevent loops
      const isBotEcho =
        m.key.fromMe &&
        m.message.extendedTextMessage?.contextInfo?.stanzaId;
      if (isBotEcho) return;

      const command = text.slice(1).toLowerCase();

      console.log("CMD:", command, "| GROUP:", isGroup);

      /* ===================== BASIC ===================== */

      if (command === "alive")
        return sock.sendMessage(jid, {
          text: "✅ *Viral-Bot Mini is Alive & Running*"
        });

      if (command === "ping")
        return sock.sendMessage(jid, { text: "🏓 Pong!" });

      if (command === "menu")
        return sock.sendMessage(jid, {
          text: `*Viral-Bot Mini Menu*

.alive
.ping
.tagall
.mute
.unmute`
        });

      /* ===================== GROUP COMMANDS ===================== */

      if (command === "tagall") {
        if (!isGroup)
          return sock.sendMessage(jid, { text: "❌ Group only command" });

        const meta = await sock.groupMetadata(jid);
        const mentions = meta.participants.map(p => p.id);

        const textTag = "*📣 Tag All*\n\n" +
          mentions.map(u => `@${u.split("@")[0]}`).join("\n");

        return sock.sendMessage(jid, {
          text: textTag,
          mentions
        });
      }

      if (command === "mute" || command === "unmute") {
        if (!isGroup)
          return sock.sendMessage(jid, { text: "❌ Group only command" });

        const meta = await sock.groupMetadata(jid);
        const admins = meta.participants
          .filter(p => p.admin)
          .map(p => p.id);

        if (!admins.includes(sender))
          return sock.sendMessage(jid, {
            text: "❌ Admins only"
          });

        await sock.groupSettingUpdate(
          jid,
          command === "mute"
            ? "announcement"
            : "not_announcement"
        );

        return sock.sendMessage(jid, {
          text:
            command === "mute"
              ? "🔇 Group muted"
              : "🔊 Group unmuted"
        });
      }
    });

  } catch (e) {
    console.error("CRITICAL:", e);
    isStarting = false;
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
  console.log("🚀 Viral-Bot Mini running on", PORT);
  if (fs.existsSync("./auth/creds.json")) startWhatsApp();
});