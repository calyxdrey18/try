class WhatsAppCommands {
    
    static async handleMenu() {
        return `
🤖 *BOT COMMANDS MENU*

*.menu* - Show this menu
*.info* - Get bot information
*.about* - About this bot
*.ping* - Check bot response time

📱 *How to use:*
Simply type any command starting with a dot (.)

⚡ *Example:* .ping

🔧 *Additional Features:*
• Auto-reconnect on disconnect
• Session persistence
• Secure pairing system

Need help? The bot is always here to assist!
        `;
    }
    
    static async handleInfo() {
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        return `
📊 *BOT INFORMATION*

*Status:* ✅ Online
*Version:* 2.0.0
*Library:* Baileys (Official)
*Platform:* Node.js
*Uptime:* ${days}d ${hours}h ${minutes}m ${seconds}s
*Server:* Render Cloud

🔧 *Technical Details:*
• Pair code authentication (8-digit)
• Multi-file auth state
• Auto-reconnection
• Command system
• Web dashboard

💡 *Note:* This bot uses official WhatsApp Web protocol.
Your messages are end-to-end encrypted.
        `;
    }
    
    static async handleAbout() {
        return `
🌟 *ABOUT THIS BOT*

*WhatsApp Bot with Pair Code System*

This bot is built using:
• @whiskeysockets/baileys (Official WhatsApp Web Library)
• Node.js & Express
• Socket.io for real-time updates
• Render for hosting

🎯 *Features:*
• No QR code scanning required
• 8-digit pair code system
• Secure verification
• Session persistence
• Web dashboard

🔒 *Security:*
• Temporary pair codes (10 min expiry)
• Verification code required
• Session isolation
• No message logging

🚀 *Quick Start:*
1. Visit the web dashboard
2. Enter your number
3. Get pair code
4. Verify and connect

Developed with ❤️ for seamless WhatsApp automation.
        `;
    }
    
    static async handlePing() {
        const startTime = Date.now();
        const serverTime = new Date().toLocaleTimeString();
        
        return `🏓 Pong!\n⏱️ Server time: ${serverTime}\n📍 Response: Instant`;
    }
    
    // Additional command for testing
    static async handleHelp() {
        return `Need help? Contact the administrator or visit the web dashboard for support.`;
    }
}

module.exports = WhatsAppCommands;