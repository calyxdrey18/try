import fs from "fs";
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

/* ===== ENSURE AUTH FOLDER EXISTS ===== */
if (!fs.existsSync("./auth")) {
  fs.mkdirSync("./auth");
}

let sock;
let pairing = false;

/* ===== START WHATSAPP BOT ===== */
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("✅ WhatsApp connected");
      pairing = false;
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔄 Reconnecting...");
        startBot();
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

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

/* ===== PAIR CODE API ===== */
app.post("/pair", async (req, res) => {
  if (!sock) {
    return res.json({ error: "Bot not ready yet" });
  }

  const { number } = req.body;
  if (!number) {
    return res.json({ error: "Phone number required" });
  }

  if (pairing) {
    return res.json({ error: "Pairing already in progress" });
  }

  try {
    pairing = true;
    const code = await sock.requestPairingCode(number);
    res.json({ pairCode: code });
  } catch (e) {
    pairing = false;
    res.json({ error: "Failed to generate pair code" });
  }
});

/* ===== FRONTEND ===== */
app.use(express.static("."));

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🌐 Server running on port", PORT);
});
