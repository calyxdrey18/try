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
  const border = "─".repeat(28);
  return `╔═─── 📢 ${title} ───═╗

${content}

╚═${border}═╝`;
}

function getCommandList() {
  return `╔═─── 📢 VIRAL-BOT MINI ───═╗

🤖  BOT COMMANDS
────────────────────────

🎯 *GENERAL COMMANDS*
█ .help    - Show this help menu
█ .info    - Get bot information
█ .stats   - Display bot statistics
█ .about   - About bot & developer
█ .ping    - Check bot responsiveness
█ .alive   - Check if bot is online
█ .menu    - Full command menu

👥 *GROUP MANAGEMENT*
█ .welcome    - Toggle welcome messages
█ .promote @user  - Make user admin
█ .demote @user   - Remove admin rights
█ .kick @user     - Remove user from group
█ .setdesc    - Change group description
█ .setpp      - Change group profile picture
█ .mute       - Close group (admin only)
█ .unmute     - Open group (admin only)
█ .antilink   - Toggle anti-link protection
█ .antisticker - Toggle anti-sticker
█ .antiaudio  - Toggle anti-audio
█ .tagall     - Tag all group members

🔔 Follow our channel for updates!

╚═────────────────────────═╝`;
}

function getBotInfo() {
  return createStyledMessage("BOT INFORMATION",
    `🤖 *Viral-Bot Mini*
────────────────────
Version: 2.0.0
Status: ONLINE
Developer: Viral-Bot Team
Platform: Node.js + Baileys
Uptime: 24/7 Active

💡 Features:
• Group Management
• Anti-Spam Protection
• Media Filtering
• Admin Controls
• User Management

📞 Support: @your_support`);
}

function getAbout() {
  return createStyledMessage("ABOUT DEVELOPER",
    `👨‍💻 *Developer Information*
────────────────────
Name: Viral-Bot Team
Experience: 3+ Years
Specialization: WhatsApp Bots
Languages: JavaScript, Python

🌟 *Bot Features*
────────────────────
• 24/7 Uptime
• Secure & Private
• Fast Response
• Regular Updates
• Multi-language Support

🔗 *Contact*
────────────────────
Channel: ${CHANNEL_LINK}
Support: Available 24/7

Thank you for using Viral-Bot Mini! 🚀`);
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
  getAbout
};