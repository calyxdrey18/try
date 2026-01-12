// utils.js
const BOT_IMAGE_URL = "https://img.sanishtech.com/u/d52d507c27a7919e9e19448a073ba4cb.jpg";
const CHANNEL_NAME = "Viral-Bot Mini Updates";
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbCGIzTJkK7C0wtGy31s";

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
█ .alive    - Check bot status
█ .ping     - Ping test
█ .tagall   - Tag all members
█ .mute     - Mute group (admin)
█ .unmute   - Unmute group (admin)

🔔 Follow our channel for updates!

╚═────────────────────────═╝`;
}

module.exports = {
  BOT_IMAGE_URL,
  CHANNEL_NAME,
  CHANNEL_LINK,
  createStyledMessage,
  getCommandList
};
