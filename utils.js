// utils.js
const BOT_IMAGE_URL = "https://img.sanishtech.com/u/d52d507c27a7919e9e19448a073ba4cb.jpg";
const CHANNEL_NAME = "Viral-Bot Mini Updates";
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbCGIzTJkK7C0wtGy31s";
const NEWSLETTER_JID = "120363405637529316@newsletter";

// Newsletter forwarding context
function getNewsletterContext() {
  return {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: NEWSLETTER_JID,
      newsletterName: CHANNEL_NAME,
      serverMessageId: -1
    }
  };
}

function createStyledMessage(title, content) {
  const border = "═".repeat(30);
  return `┌──────────────────────────────────────────────┐
│ 🔥 ${title}
├──────────────────────────────────────────────┤
${content}
└──────────────────────────────────────────────┘`;
}

function getCommandList() {
  return `╔══════════════════════════════════════════╗
║              🤖 VIRAL-BOT MINI               ║
╠══════════════════════════════════════════╣
║                                          ║
║  📋 *GENERAL COMMANDS*                   ║
║  • .help    - Show help menu             ║
║  • .info    - Get bot information        ║
║  • .stats   - Display bot statistics     ║
║  • .about   - About bot & developer      ║
║  • .ping    - Check bot responsiveness   ║
║  • .alive   - Check if bot is online     ║
║  • .menu    - Full command menu          ║
║                                          ║
║  👑 *GROUP MANAGEMENT*                   ║
║  • .welcome    - Toggle welcome messages ║
║  • .promote @user - Make user admin      ║
║  • .demote @user  - Remove admin rights  ║
║  • .kick @user    - Remove user          ║
║  • .setdesc text - Change description    ║
║  • .setpp        - Change group photo    ║
║  • .mute         - Close group           ║
║  • .unmute       - Open group            ║
║  • .antilink     - Toggle anti-link      ║
║  • .antisticker  - Toggle anti-sticker   ║
║  • .antiaudio    - Toggle anti-audio     ║
║  • .tagall       - Mention all members   ║
║                                          ║
║  📢 *Follow our channel for updates!*    ║
║  ${CHANNEL_LINK} ║
║                                          ║
╚══════════════════════════════════════════╝`;
}

function getBotInfo() {
  return createStyledMessage("BOT INFORMATION",
    `🤖 *Viral-Bot Mini*
    
📊 Version: 2.0.0
✅ Status: ONLINE
👨‍💻 Developer: Calyx Drey 
⚙️ Platform: Node.js + Baileys
⏱️ Uptime: 24/7 Active

💡 *Features:*
• Group Management Tools
• Anti-Spam Protection
• Media Filtering System
• Admin Controls
• User Management

📞 Support: @+263786624966
📢 Channel: ${CHANNEL_LINK}`);
}

function getAbout() {
  return createStyledMessage("ABOUT DEVELOPER",
    `👨‍💻 *Developer Information*
    
Name: Calyx Drey
Experience: 3+ Years
Specialization: WhatsApp Bots
Languages: JavaScript, Python

✨ *Bot Features*
• 24/7 Uptime & Reliability
• Secure & Private Operations
• Fast Response Time
• Regular Updates
• Multi-language Support

📬 *Contact Information*
Channel: ${CHANNEL_LINK}
Support: Available 24/7

Thank you for using Viral-Bot Mini! 🙏`);
}

function getAliveMessage() {
  return `✅ *Viral-Bot Mini is Alive & Running*

📊 *System Status*
├─ Status: ONLINE
├─ Uptime: 100%
├─ Version: 2.0.0
├─ Commands: 20+ Active
└─ Response: < 1 second

⚡ *Performance Metrics*
├─ Memory: Optimized
├─ Speed: High
├─ Reliability: 99.9%
└─ Updates: Automatic

📢 Stay updated: ${CHANNEL_LINK}`;
}

function getMenuMessage() {
  return `🤖 *Viral-Bot Mini Command Menu*

Use any command by typing a dot (.) before it
Example: .help, .alive, .menu

📋 *Available Commands:*
• .help    - Show all commands
• .alive   - Check bot status
• .menu    - Show this menu
• .ping    - Test bot speed
• .info    - Bot information
• .stats   - Usage statistics
• .about   - About developer

👑 *Group Commands (Admin only):*
• .promote @user - Make admin
• .demote @user  - Remove admin
• .kick @user    - Remove member
• .tagall        - Mention everyone
• .mute/.unmute  - Group settings

🔧 *Group Settings (Admin only):*
• .antilink    - Block links
• .antisticker - Block stickers
• .antiaudio   - Block audio
• .setdesc     - Change description
• .setpp       - Change group photo

📢 *Stay Updated:*
${CHANNEL_LINK}

Type .help for detailed command list!`;
}

module.exports = {
  BOT_IMAGE_URL,
  CHANNEL_NAME,
  CHANNEL_LINK,
  NEWSLETTER_JID,
  getNewsletterContext,
  createStyledMessage,
  getCommandList,
  getBotInfo,
  getAbout,
  getAliveMessage,
  getMenuMessage
};