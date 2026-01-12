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
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

/* ================= CONFIG ================= */
const BOT_IMAGE_URL =
  "https://img.sanishtech.com/u/d52d507c27a7919e9e19448a073ba4cb.jpg";

const CHANNEL_NAME = "Viral-Bot Mini Updates";
const CHANNEL_LINK =
  "https://whatsapp.com/channel/0029VbCGIzTJkK7C0wtGy31s";

/* ================= GLOBAL ================= */
let sock;
let pairingCode = null;
let starting = false;

/* ================= START WHATSAPP ================= */
async function startWhatsApp(phoneForPair = null) {
  if (starting) return;
  starting = true;

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

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ WhatsApp Connected");
      pairingCode = null;
      starting = false;
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;
      starting = false;
      if (shouldReconnect) startWhatsApp();
    }
  });

  if (phoneForPair && !sock.authState.creds.registered) {
    setTimeout(async () => {
      pairingCode = await sock.requestPairingCode(phoneForPair);
      console.log("🔐 Pair Code:", pairingCode);
    }, 3000);
  }

  /* ================= MESSAGE HANDLER ================= */
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m?.message) return;

    const jid = m.key.remoteJid;
    if (jid === "status@broadcast") return;

    const isGroup = jid.endsWith("@g.us");
    const sender = isGroup ? m.key.participant : jid;

    const text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      "";

    if (!text.startsWith(".")) return;
    const command = text.slice(1).toLowerCase();

    /* ========= BASIC ========= */

    if (command === "ping") {
      return sock.sendMessage(jid, { text: "🏓 *PONG!*" });
    }

    if (command === "alive") {
      return sock.sendMessage(jid, {
        image: { url: BOT_IMAGE_URL },
        caption: `🟢 *BOT STATUS*
━━━━━━━━━━━━━━
✅ *Viral-Bot Mini is ONLINE*
⚡ Fast & Stable`
      });
    }

    /* ========= MENU (REAL BUTTON) ========= */

    if (command === "menu") {
      const media = await sock.prepareMessageMedia(
        { image: { url: BOT_IMAGE_URL } },
        { upload: sock.waUploadToServer }
      );

      return sock.sendMessage(jid, {
        interactiveMessage: {
          header: {
            hasMediaAttachment: true,
            imageMessage: media.imageMessage
          },
          body: {
            text: `📢 *${CHANNEL_NAME}*
━━━━━━━━━━━━━━

🤖 *VIRAL-BOT MINI*

✨ Available Commands:
• .alive
• .ping
• .tagall
• .mute
• .unmute

🔔 Get updates, fixes & new features
by following our official channel.`
          },
          nativeFlowMessage: {
            buttons: [
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "📢 View Channel",
                  url: CHANNEL_LINK
                })
              }
            ]
          }
        }
      });
    }

    /* ========= GROUP ========= */

    if (command === "tagall") {
      if (!isGroup)
        return sock.sendMessage(jid, { text: "❌ Group only" });

      const meta = await sock.groupMetadata(jid);
      const mentions = meta.participants.map(p => p.id);

      return sock.sendMessage(jid, {
        text:
          "📣 *TAG ALL*\n━━━━━━━━━━━━━━\n" +
          mentions.map(u => `@${u.split("@")[0]}`).join("\n"),
        mentions
      });
    }

    if (command === "mute" || command === "unmute") {
      if (!isGroup)
        return sock.sendMessage(jid, { text: "❌ Group only" });

      const meta = await sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender))
        return sock.sendMessage(jid, { text: "❌ Admins only" });

      await sock.groupSettingUpdate(
        jid,
        command === "mute" ? "announcement" : "not_announcement"
      );

      return sock.sendMessage(jid, {
        text:
          command === "mute"
            ? "🔇 *Group Muted*"
            : "🔊 *Group Unmuted*"
      });
    }
  });
}

/* ================= PAIR API ================= */
app.post("/pair", async (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "");
  if (!phone) return res.json({ success: false });

  pairingCode = null;
  await startWhatsApp(phone);

  let t = 0;
  const wait = setInterval(() => {
    t++;
    if (pairingCode) {
      clearInterval(wait);
      res.json({ success: true, code: pairingCode });
    }
    if (t > 25) {
      clearInterval(wait);
      res.json({ success: false, error: "Timeout" });
    }
  }, 1000);
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("🚀 Viral-Bot Mini running on", PORT);
  if (fs.existsSync("./auth/creds.json")) startWhatsApp();
});