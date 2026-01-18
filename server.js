import express from "express";
import P from "pino";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";
import { commands } from "./commands.js";

const app = express();
app.use(express.json());

let sock;
let pairing = false;

/* ================= START BOT ================= */

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ WhatsApp Connected");
      pairing = false;
    }

    if (connection === "close") {
      if (
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut
      ) {
        startBot();
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const cmd = text.toLowerCase().trim();

    if (cmd.startsWith(".")) {
      const name = cmd.slice(1);
      if (commands[name]) {
        await sock.sendMessage(msg.key.remoteJid, {
          text: commands[name]
        });
      }
    }
  });
}

startBot();

/* ================= PAIR CODE API ================= */

app.post("/pair", async (req, res) => {
  const { number } = req.body;

  if (!number) {
    return res.json({ error: "Phone number is required" });
  }

  if (!sock || pairing) {
    return res.json({ error: "Bot not ready" });
  }

  try {
    pairing = true;
    const code = await sock.requestPairingCode(number);
    res.json({ pairCode: code });
  } catch (err) {
    pairing = false;
    res.json({ error: "Failed to generate pair code" });
  }
});

/* ================= FRONTEND ================= */

app.use(express.static("."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});