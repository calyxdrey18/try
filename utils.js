// utils.js
const BOT_IMAGE_URL = "https://img.sanishtech.com/u/d52d507c27a7919e9e19448a073ba4cb.jpg";
const CHANNEL_NAME = "Viral-Bot Mini Updates";
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbCGIzTJkK7C0wtGy31s";
const NEWSLETTER_JID = "120363405637529316@newsletter";

function getNewsletterContext() {
  return {
    externalAdReply: {
      title: CHANNEL_NAME,
      body: "Stay updated with bot news",
      thumbnailUrl: BOT_IMAGE_URL,
      sourceUrl: CHANNEL_LINK,
      mediaType: 1
    }
  };
}

function createStyledMessage(title, content) {
  const border = "─".repeat(35);
  return `╭${border}╮
│ ✨ ${title.padEnd(32)} │
├${border}┤
${content.split('\n').map(line => `│ ${line.padEnd(34)} │`).join('\n')}
╰${border}╯`;
}

function getCommandList() {
  const content = `
🤖 GENERAL COMMANDS
────────────────────
• .help    - Show help menu
• .info    - Get bot information
• .stats   - Display bot statistics
• .about   - About bot & developer
• .ping    - Check bot responsiveness
• .alive   - Check if bot is online
• .menu    - Full command menu with image

👥 GROUP MANAGEMENT
────────────────────
• .welcome    - Toggle welcome messages
• .promote @user  - Make user admin
• .demote @user   - Remove admin rights
• .kick @user     - Remove user from group
• .setdesc [text] - Change group description
• .setpp      - Change group profile picture
• .mute       - Close group (admin only)
• .unmute     - Open group (admin only)
• .antilink   - Toggle anti-link protection
• .antisticker - Toggle anti-sticker
• .antiaudio  - Toggle anti-audio
• .tagall     - Tag all group members

📢 Follow our channel for updates!
${CHANNEL_LINK}`;

  return createStyledMessage("VIRAL-BOT MINI COMMANDS", content);
}

function getBotInfo() {
  const content = `
🤖 Viral-Bot Mini
────────────────────
Version: 2.0.0
Status: ONLINE
Developer: Calyx Drey 
Platform: Node.js + Baileys
Uptime: 24/7 Active

⚡ Features:
• Group Management
• Anti-Spam Protection
• Media Filtering
• Admin Controls
• User Management

📞 Support: +263786624966`;

  return createStyledMessage("BOT INFORMATION", content);
}

function getAbout() {
  const content = `
👨‍💻 Developer Information
────────────────────
Name: Calyx Drey
Experience: 3+ Years
Specialization: WhatsApp Bots
Languages: JavaScript, Python

🚀 Bot Features
────────────────────
• 24/7 Uptime
• Secure & Private
• Fast Response
• Regular Updates

📞 Contact
────────────────────
Channel: ${CHANNEL_LINK}
Support: Available 24/7

Thank you for using Viral-Bot Mini! ❤️`;

  return createStyledMessage("ABOUT DEVELOPER", content);
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