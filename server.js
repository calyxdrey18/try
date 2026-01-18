const { default: makeWASocket, useMultiFileAuthState, Browsers, delay, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const path = require("path");
const pino = require("pino");
const fs = require("fs");
const { handleCommand } = require("./commands");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(require("cors")());

// Serve the frontend
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

let sock;
const authPath = "./auth_info";

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Explicitly disabled
        logger: pino({ level: "silent" }),
        browser: Browsers.ubuntu("Chrome")
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === "open") {
            console.log("✅ Bot Connected Successfully!");
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        await handleCommand(sock, msg);
    });
}

// Endpoint to get Pair Code
app.get("/get-code", async (req, res) => {
    let phoneNumber = req.query.number;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number is required" });

    // Clean number: remove +, spaces, dashes
    phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

    try {
        if (!sock || !sock.user) {
            // If bot isn't initialized or not logged in, we use a temp instance to get code
            // Note: In a production multi-user scenario, logic here would be more complex.
        }
        
        // Request pairing code from Baileys
        // We delay slightly to ensure socket is ready
        await delay(3000);
        const code = await sock.requestPairingCode(phoneNumber);
        res.json({ code });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to generate code. Try again." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startBot();
});
