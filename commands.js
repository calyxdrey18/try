class WhatsAppCommands {
    
    static async handleMenu(client, message) {
        const menu = `
🤖 *BOT COMMANDS MENU*

*.menu* - Show this menu
*.info* - Get bot information
*.about* - About this bot
*.ping* - Check bot response time

📱 *How to use:*
Simply type any command starting with a dot (.)

⚡ *Example:* .ping

Need help? The bot is always here to assist!
        `;
        
        await message.reply(menu);
    }
    
    static async handleInfo(client, message) {
        const info = `
📊 *BOT INFORMATION*

*Status:* ✅ Online
*Version:* 1.0.0
*Platform:* WhatsApp Web JS
*Uptime:* 24/7
*Developer:* Your Name

🔧 *Features:*
• Pair code authentication
• Command system
• Web dashboard
• Real-time status

💡 *Note:* This bot respects your privacy and only processes commands you send.
        `;
        
        await message.reply(info);
    }
    
    static async handleAbout(client, message) {
        const about = `
🌟 *ABOUT THIS BOT*

This WhatsApp bot is built with:
• Node.js and Express
• whatsapp-web.js library
• Pair code authentication system
• Web interface for easy setup

🎯 *Purpose:*
Provide an easy-to-use WhatsApp automation solution with secure pairing through unique codes.

🔒 *Security:*
• Local authentication
• Temporary pair codes
• No message storage
• End-to-end encryption preserved

Developed with ❤️ for the community.
        `;
        
        await message.reply(about);
    }
    
    static async handlePing(client, message) {
        const startTime = Date.now();
        await message.reply('🏓 Pong!');
        const endTime = Date.now();
        const latency = endTime - startTime;
        
        await message.reply(`⏱️ Response time: ${latency}ms\n🕐 Server time: ${new Date().toLocaleTimeString()}`);
    }
}

module.exports = WhatsAppCommands;