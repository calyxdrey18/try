const express = require("express")
const cors = require("cors")
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
app.use(express.static("public"))

let sock

async function startBot() {
  if (sock) return sock

  const { state, saveCreds } = await useMultiFileAuthState("./session")

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: "silent" })
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return

    const from = msg.key.remoteJid
    const cmd = text.toLowerCase()

    // 🔥 Commands
    if (cmd === "ping") {
      const start = Date.now()
      await sock.sendMessage(from, { text: "🏓 Pinging..." })
      const speed = Date.now() - start

      await sock.sendMessage(from, {
        text: `⚡ *VIRAL-BOT MINI*\n\n🏓 Pong: ${speed}ms`
      })
    }

    if (cmd === "menu") {
      await sock.sendMessage(from, {
        text: `
🤖 *VIRAL-BOT MINI*
━━━━━━━━━━━━━━━
📌 Commands:
• ping
• menu

🚀 Fast • Simple • Viral
━━━━━━━━━━━━━━━
`
      })
    }
  })

  sock.ev.on("connection.update", (update) => {
    if (update.connection === "close") {
      sock = null
      startBot()
    }
  })

  return sock
}

// 🔑 Pairing Code API
app.post("/pair", async (req, res) => {
  const { number } = req.body
  if (!number) return res.json({ error: "Number required" })

  try {
    const bot = await startBot()
    const code = await bot.requestPairingCode(number)
    res.json({ code })
  } catch (err) {
    res.json({ error: "Pairing failed" })
  }
})

app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"))
})

app.listen(3000, () => {
  console.log("🚀 Viral-Bot Mini running on port 3000")
})
