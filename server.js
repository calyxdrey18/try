const express = require("express");
const path = require("path");
const fs = require("fs");
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    Browsers, 
    delay, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const CommandHandler = require("./commands");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(require("cors")());

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

let sock;
let commandHandler;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.ubuntu("Chrome")
    });

    commandHandler = new CommandHandler(sock);

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("messages.upsert", async (m) => {
        await commandHandler.handleMessage(m.messages[0]);
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });
}

app.post("/pair", async (req, res) => {
    let phone = req.body.phone.replace(/[^0-9]/g, "");
    if (!phone) return res.status(400).json({ error: "Invalid phone number" });

    try {
        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(phone);
            res.json({ code });
        } else {
            res.json({ error: "Bot is already linked!" });
        }
    } catch (err) {
        res.status(500).json({ error: "Linking failed. Try again." });
    }
});

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    startBot();
});