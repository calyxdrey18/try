const BOT_IMAGE_URL = "https://img.sanishtech.com/u/d52d507c27a7919e9e19448a073ba4cb.jpg";
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbCGIzTJkK7C0wtGy31s";

function getCommandList() {
  return `🤖 *Viral-Bot Mini Commands*

📋 *General Commands:*
• .alive - Check bot status
• .ping - Test response time
• .menu - Show command menu
• .help - Detailed commands list
• .info - Bot information
• .stats - Usage statistics
• .about - About developer

👑 *Group Commands (Admin):*
• .tagall - Mention all members
• .promote @user - Make admin
• .demote @user - Remove admin
• .kick @user - Remove member
• .mute - Close group
• .unmute - Open group

🔧 *Group Settings (Admin):*
• .antilink - Toggle link blocking
• .antisticker - Toggle sticker blocking
• .setdesc [text] - Change description
• .setpp - Change group photo

📢 *Stay Updated:*
${CHANNEL_LINK}`;
}

function getBotInfo() {
  return `🤖 *Viral-Bot Mini Information*

📊 Version: 2.0.0
✅ Status: ONLINE
👨‍💻 Developer: Calyx Drey
⚙️ Platform: Node.js + Baileys
⏱️ Uptime: 24/7 Active

💡 Features:
• Group Management
• Anti-Spam Protection
• Media Filtering
• Admin Controls
• Fast Response

📞 Support: @+263786624966
📢 Channel: ${CHANNEL_LINK}`;
}

function getAbout() {
  return `👨‍💻 *About Developer*

Name: Calyx Drey
Experience: 3+ Years
Specialization: WhatsApp Bots
Languages: JavaScript, Python

✨ *Bot Features:*
• 24/7 Uptime
• Secure & Private
• Regular Updates
• Multi-language Support

📬 *Contact:*
Channel: ${CHANNEL_LINK}
Support: Available 24/7

Thank you for using Viral-Bot Mini! 🙏`;
}

module.exports = {
  BOT_IMAGE_URL,
  CHANNEL_LINK,
  getCommandList,
  getBotInfo,
  getAbout
};