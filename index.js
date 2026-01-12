const express = require("express")
const cors = require("cors")
const fs = require("fs")
const path = require("path")
const P = require("pino")

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const app = express()
app.use(cors())
app.use(express.json())

let sock
let isStarting = false

async function startBot() {
  if (sock || isStarting) return sock
  isStarting = true

  const { state, saveCreds } = await useMultiFileAuthState("./session")

  sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["Viral-Bot Mini", "Chrome", "1.0.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg?.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return
    const cmd = text.toLowerCase()

    if (cmd === "ping") {
      const start = Date.now()
      await sock.sendMessage(from, { text: "🏓 Pinging..." })
      await sock.sendMessage(from, {
        text: `⚡ *VIRAL-BOT MINI*\nPong: ${Date.now() - start}ms`
      })
    }

    if (cmd === "menu") {
      await sock.sendMessage(from, {
        text: `
🤖 *VIRAL-BOT MINI*
━━━━━━━━━━━━━━
• ping
• menu
━━━━━━━━━━━━━━
`
      })
    }
  })

  sock.ev.on("connection.update", (u) => {
    if (u.connection === "close") {
      sock = null
      startBot()
    }
  })

  isStarting = false
  return sock
}

// ✅ REAL PAIRING ENDPOINT (NO DEMO)
app.post("/pair", async (req, res) => {
  let { number } = req.body
  if (!number) return res.json({ error: "Number required" })

  // ✅ Normalize number (VERY IMPORTANT)
  number = number.replace(/\D/g, "")

  try {
    const bot = await startBot()

    if (bot.authState.creds.registered) {
      return res.json({ error: "Bot already paired" })
    }

    const code = await bot.requestPairingCode(number)
    res.json({ code })
  } catch (e) {
    console.error(e)
    res.json({ error: "Pairing failed" })
  }
})

// Serve frontend (same directory)
app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "index.html"))
})

app.listen(3000, () =>
  console.log("🚀 Viral-Bot Mini running on port 3000")
)
