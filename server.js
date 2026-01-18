import fs from "fs";
import express from "express";
import P from "pino";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";
import { commands } from "./commands.js";

/* ================= BASIC SERVER ================= */

const app = express();
app.use(express.json());
app.use(express.static("."));

const PORT = process.env.PORT || 3000;

/* ================= GLOBAL STATE ================= */

let sock = null;
let ready = false;

/* ================= AUTH DIR ================= */

if (!fs.existsSync("auth")) {
  fs.mkdirSync("auth");
}

/* ================= START HTTP FIRST ================= */

app.listen(PORT, () => {
  console.log("🌐 Server running on", PORT);
  startBot(); // START BOT ONLY AFTER SERVER IS LIVE
});

/* ================= BOT ================= */

async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("auth");

    sock = makeWASocket({
      auth: state,
      logger: P({ level: "silent" }),
      printQRInTerminal: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        ready = true;
        console.log("✅ WhatsApp connected");
      }

      if (connection === "close") {
        ready = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          setTimeout(startBot, 5000); // SAFE RECONNECT
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      const m = messages?.[0];
      if (!m?.message || m.key.fromMe) return;

      const text =
        m.message.conversation ||
        m.message.extendedTextMessage?.text ||
        "";

      if (!text.startsWith(".")) return;

      const cmd = text.slice(1).toLowerCase();
      if (commands[cmd]) {
        await sock.sendMessage(m.key.remoteJid, {
          text: commands[cmd]
        });
      }
    });

  } catch (err) {
    console.error("❌ Bot start failed, retrying...");
    setTimeout(startBot, 5000);
  }
}

/* ================= PAIR CODE API ================= */

app.post("/pair", async (req, res) => {
  if (!sock || !ready) {
    return res.json({ error: "Bot not ready yet" });
  }

  const { number } = req.body;
  if (!number) {
    return res.json({ error: "Number required" });
  }

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ pairCode: code });
  } catch {
    res.json({ error: "Pairing failed" });
  }
});
