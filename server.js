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

/* ===================== STYLE UTILITIES ===================== */
const styles = {
  borderTop: "─",
  borderBottom: "─",
  borderSide: "█",
  cornerTL: "╔═",
  cornerTR: "═╗",
  cornerBL: "╚═",
  cornerBR: "═╝",
  borderLength: 28
};

function createBox(content, title = null) {
  const lines = content.split('\n');
  const maxLength = Math.max(...lines.map(l => l.length), title ? title.length : 0);
  const borderLength = Math.max(maxLength, styles.borderLength);
  
  let box = '';
  
  // Top border with optional title
  if (title) {
    const titleFormatted = ` 📢 ${title.toUpperCase()} `;
    box += `${styles.cornerTL}${styles.borderTop.repeat(borderLength - titleFormatted.length + 2)}${titleFormatted}${styles.borderTop.repeat(2)}${styles.cornerTR}\n`;
  } else {
    box += `${styles.cornerTL}${styles.borderTop.repeat(borderLength)}${styles.cornerTR}\n`;
  }
  
  // Content
  lines.forEach(line => {
    box += `${styles.borderSide} ${line}${' '.repeat(borderLength - line.length - 1)}${styles.borderSide}\n`;
  });
  
  // Bottom border
  box += `${styles.cornerBL}${styles.borderBottom.repeat(borderLength)}${styles.cornerBR}`;
  
  return box;
}

function createCommandList() {
  return createBox(
`🤖  BOT COMMANDS
${styles.borderBottom.repeat(26)}
█ .alive    - Check bot status
█ .ping     - Ping test
█ .tagall   - Tag all members
█ .mute     - Mute group (admin)
█ .unmute   - Unmute group (admin)

🔔 Follow our channel for updates!`,
"VIRAL-BOT MINI"
  );
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

      const command = text.slice(1).toLowerCase();

      /* ===================== BASIC ===================== */

      if (command === "alive") {
        return sock.sendMessage(jid, {
          image: { url: BOT_IMAGE_URL },
          caption: `✅ *Viral-Bot Mini is Alive & Running*\n\n${createBox("Status: ONLINE\nUptime: 100%\nVersion: 2.0.0", "SYSTEM STATUS")}`
        });
      }

      if (command === "ping") {
        return sock.sendMessage(jid, { 
          text: createBox("🏓 PONG!\nResponse: Instant\nStatus: Optimal", "PING TEST")
        });
      }

      if (command === "menu") {
        return sock.sendMessage(jid, {
          image: { url: BOT_IMAGE_URL },
          caption: createCommandList(),
          buttons: [
            {
              buttonId: "open_channel",
              buttonText: { displayText: "📢 View Channel" },
              type: 1
            }
          ],
          headerType: 4
        });
      }

      /* ===================== GROUP ===================== */

      if (command === "tagall") {
        if (!isGroup)
          return sock.sendMessage(jid, { 
            text: createBox("❌ COMMAND FAILED\nThis command only works in groups!", "ERROR")
          });

        const meta = await sock.groupMetadata(jid);
        const mentions = meta.participants.map(p => p.id);

        const mentionList = mentions.map(u => `@${u.split("@")[0]}`).join(" ");
        const tagBox = createBox(
`📣 TAG ALL MEMBERS
${styles.borderBottom.repeat(24)}
Total: ${mentions.length} members

${mentionList}`,
"GROUP ACTION"
        );

        return sock.sendMessage(jid, { 
          text: tagBox, 
          mentions 
        });
      }

      if (command === "mute" || command === "unmute") {
        if (!isGroup)
          return sock.sendMessage(jid, { 
            text: createBox("❌ COMMAND FAILED\nThis command only works in groups!", "ERROR")
          });

        const meta = await sock.groupMetadata(jid);
        const admins = meta.participants
          .filter(p => p.admin)
          .map(p => p.id);

        if (!admins.includes(sender))
          return sock.sendMessage(jid, { 
            text: createBox("❌ PERMISSION DENIED\nOnly admins can use this command!", "ERROR")
          });

        await sock.groupSettingUpdate(
          jid,
          command === "mute"
            ? "announcement"
            : "not_announcement"
        );

        const action = command === "mute" ? "🔇 GROUP MUTED" : "🔊 GROUP UNMUTED";
        return sock.sendMessage(jid, {
          text: createBox(
`${action}
Group: ${meta.subject}
Action by: @${sender.split("@")[0]}`,
"ADMIN ACTION"
          )
        });
      }
      
      // Help command fallback
      if (command === "help") {
        return sock.sendMessage(jid, {
          text: createCommandList()
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
  console.log(createBox(
`🚀 Viral-Bot Mini
Port: ${PORT}
Status: Initializing
Version: 2.0.0`,
"SYSTEM STARTUP"
  ));
  if (fs.existsSync("./auth/creds.json")) startWhatsApp();
});
