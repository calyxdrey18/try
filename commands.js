module.exports = {
    handleCommand: async (sock, msg) => {
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const from = msg.key.remoteJid;
        const prefix = ".";

        if (!body.startsWith(prefix)) return;
        const command = body.slice(1).trim().toLowerCase();

        switch (command) {
            case "ping":
                const start = Date.now();
                await sock.sendMessage(from, { text: "Calculating..." });
                const end = Date.now();
                await sock.sendMessage(from, { text: `🏓 Pong! Speed: ${end - start}ms` });
                break;

            case "menu":
                const menuText = `*🤖 Bot Menu*\n\n` +
                                 `.ping - Check bot speed\n` +
                                 `.info - Get bot info\n` +
                                 `.about - About this bot\n` +
                                 `.menu - Show this list`;
                await sock.sendMessage(from, { text: menuText });
                break;

            case "info":
                await sock.sendMessage(from, { text: "🤖 *Bot Info*\nLibrary: Baileys\nPlatform: Render\nStatus: Online ✅" });
                break;

            case "about":
                await sock.sendMessage(from, { text: "✨ *About*\nThis bot was created to link via pairing code using a web dashboard. Built with Node.js and @whiskeysockets/baileys." });
                break;
        }
    }
};
