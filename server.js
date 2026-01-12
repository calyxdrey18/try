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

/* ===================== CONFIG ===================== */
const BOT_IMAGE_URL =
  "https://img.sanishtech.com/u/d52d507c27a7919e9e19448a073ba4cb.jpg";

const CHANNEL_NAME = "Viral-Bot Mini Updates";
const CHANNEL_LINK =
  "https://whatsapp.com/channel/0029VbCGIzTJkK7C0wtGy31s";

/* ===================== SIMPLE FORMATTING ===================== */
function createStyledMessage(title, content) {
  // Simple styling without complex characters that might break WhatsApp
  const border = "─".repeat(28);
  return `╔═─── 📢 ${title} ───═╗

${content}

╚═${border}═╝`;
}

function getCommandList() {
  return `╔═─── 📢 VIRAL-BOT MINI ───═╗

🤖  BOT COMMANDS
────────────────────────
█ .alive    - Check bot status
█ .ping     - Ping test
█ .tagall   - Tag all members
█ .mute     - Mute group (admin)
█ .unmute   - Unmute group (admin)

🔔 Follow our channel for updates!

╚═────────────────────────═╝`;
}

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

      const jid = m.key.remoteJid;
      if (jid === "status@broadcast") return;

      const isGroup = jid.endsWith("@g.us");
      const sender = isGroup
        ? m.key.participant || jid
        : jid;

      /* -------- Button Click -------- */
      if (m.message.buttonsResponseMessage) {
        const btn =
          m.message.buttonsResponseMessage.selectedButtonId;

        if (btn === "open_channel") {
          return sock.sendMessage(jid, {
            text: `📢 *${CHANNEL_NAME}*\n\nFollow our WhatsApp Channel:\n${CHANNEL_LINK}`
          });
        }
      }

      /* -------- Extract Text -------- */
      const type = Object.keys(m.message)[0];
      const text =
        type === "conversation"
          ? m.message.conversation
          : type === "extendedTextMessage"
          ? m.message.extendedTextMessage.text
          : "";

      if (!text || !text.startsWith(".")) return;

      // Prevent reply loops
      const isBotEcho =
        m.key.fromMe &&
        m.message.extendedTextMessage?.contextInfo?.stanzaId;
      if (isBotEcho) return;

      const command = text.slice(1).toLowerCase().trim();

      /* ===================== BASIC ===================== */

      if (command === "alive") {
        return sock.sendMessage(jid, {
          image: { url: BOT_IMAGE_URL },
          caption: createStyledMessage("SYSTEM STATUS", "✅ Viral-Bot Mini is Alive & Running\n\nStatus: ONLINE\nUptime: 100%\nVersion: 2.0.0")
        });
      }

      if (command === "ping") {
        return sock.sendMessage(jid, { 
          text: createStyledMessage("PING TEST", "🏓 PONG!\nResponse: Instant\nStatus: Optimal")
        });
      }

      if (command === "menu") {
        return sock.sendMessage(jid, {
          text: getCommandList(),
          buttons: [
            {
              buttonId: "open_channel",
              buttonText: { displayText: "📢 View Channel" },
              type: 1
            }
          ],
          headerType: 1
        });
      }

      /* ===================== GROUP ===================== */

      if (command === "tagall") {
        if (!isGroup)
          return sock.sendMessage(jid, { 
            text: createStyledMessage("ERROR", "❌ This command only works in groups!")
          });

        const meta = await sock.groupMetadata(jid);
        const mentions = meta.participants.map(p => p.id);

        const mentionList = mentions.map(u => `@${u.split("@")[0]}`).join(" ");
        
        return sock.sendMessage(jid, { 
          text: createStyledMessage(
            "GROUP ACTION", 
            `📣 TAG ALL MEMBERS\n\nTotal: ${mentions.length} members\n\n${mentionList}`
          ), 
          mentions 
        });
      }

      if (command === "mute" || command === "unmute") {
        if (!isGroup)
          return sock.sendMessage(jid, { 
            text: createStyledMessage("ERROR", "❌ This command only works in groups!")
          });

        const meta = await sock.groupMetadata(jid);
        const admins = meta.participants
          .filter(p => p.admin)
          .map(p => p.id);

        if (!admins.includes(sender))
          return sock.sendMessage(jid, { 
            text: createStyledMessage("ERROR", "❌ Only admins can use this command!")
          });

        await sock.groupSettingUpdate(
          jid,
          command === "mute"
            ? "announcement"
            : "not_announcement"
        );

        const action = command === "mute" ? "🔇 GROUP MUTED" : "🔊 GROUP UNMUTED";
        return sock.sendMessage(jid, {
          text: createStyledMessage(
            "ADMIN ACTION",
            `${action}\nGroup: ${meta.subject}\nAction by: @${sender.split("@")[0]}`
          )
        });
      }
      
      // Help command fallback
      if (command === "help") {
        return sock.sendMessage(jid, {
          text: getCommandList()
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
  console.log(`🚀 Viral-Bot Mini running on port ${PORT}`);
  if (fs.existsSync("./auth/creds.json")) startWhatsApp();
});
