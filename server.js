const express = require("express")
const fs = require("fs")
const path = require("path")
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys")
const Pino = require("pino")

const app = express()
app.use(express.json())

let sock
let pairCode = ""

/* ================= WHATSAPP ================= */

async function startBot(phone) {
  const { state, saveCreds } = await useMultiFileAuthState("auth")
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    logger: Pino({ level: "silent" }),
    auth: state
  })

  sock.ev.on("creds.update", saveCreds)

  if (!state.creds.registered) {
    pairCode = await sock.requestPairingCode(phone)
    console.log("PAIR CODE:", pairCode)
  }

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      console.log("✅ WhatsApp connected")
    }
  })

  /* ---- Your group management bot logic here ---- */
}

/* ================= API ================= */

app.post("/pair", async (req, res) => {
  const { phone } = req.body
  if (!phone) return res.json({ error: "Phone number required" })

  await startBot(phone)

  setTimeout(() => {
    res.json({ code: pairCode })
  }, 1500)
})

/* ================= FRONTEND ================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"))
})

/* ================= SERVER ================= */

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🌐 Running on port ${PORT}`)
})
