const BOT_IMAGE_URL = "https://img.sanishtech.com/u/d52d507c27a7919e9e19448a073ba4cb.jpg";
const CHANNEL_NAME = "Viral-Bot Mini Updates";
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbCGIzTJkK7C0wtGy31s";
const NEWSLETTER_JID = "120363405637529316@newsletter";

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
  const border = "─".repeat(25);
  return `┏▣ ◈ *${title}* ◈\n│${border}\n${content.split('\n').map(line => `│➽ ${line}`).join('\n')}\n┗▣`;
}

function getCommandList() {
  return `┏▣ ◈ *VIRAL-BOT MINI* ◈
│────────────────────────
│➽ .help
│➽ .info
│➽ .stats
│➽ .about
│➽ .ping
│➽ .alive
│➽ .menu
┗▣

┏▣ ◈ *GROUP MANAGEMENT* ◈
│────────────────────────
│➽ .tagall
│➽ .mute / .unmute
│➽ .antilink (on/off)
┗▣

📢 *Channel:* ${CHANNEL_LINK}`;
}

module.exports = {
  BOT_IMAGE_URL,
  CHANNEL_NAME,
  CHANNEL_LINK,
  getNewsletterContext,
  createStyledMessage,
  getCommandList
};