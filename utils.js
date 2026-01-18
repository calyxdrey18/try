
// utils.js
const BOT_IMAGE_URL = "https://img.sanishtech.com/u/d52d507c27a7919e9e19448a073ba4cb.jpg";
const CHANNEL_NAME = "Viral-Bot Mini Updates";
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbCGIzTJkK7C0wtGy31s";
const NEWSLETTER_JID = "120363405637529316@newsletter";

// Function to ensure image URL is valid
function getBotImage() {
  // Fallback image in case the main one fails
  const fallbackImage = "https://telegra.ph/file/87a3b8a3c7e7d6b3c9c9d.jpg";
  return {
    url: BOT_IMAGE_URL,
    fallback: fallbackImage
  };
}

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
  const border = "─".repeat(25);
  return `┏▣ ◈ *${title}* ◈
│${border}
│${content.split('\n').map(line => `│➽ ${line}`).join('\n')}
┗▣`;
}

function getCommandList() {
  return `┏▣ ◈ *VIRAL-BOT MINI* ◈
│────────────────────────
│➽ help
│➽ info
│➽ stats
│➽ about
│➽ ping
│➽ alive
│➽ menu
┗▣

┏▣ ◈ *GROUP MANAGEMENT* ◈
│────────────────────────
│➽ welcome        
│➽ promote @user   
│➽ demote  @user   
│➽ kick    @user
│➽ setdesc
│➽ setpp
│➽ mute
│➽ unmute
│➽ antilink
│➽ antisticker
│➽ antiaudio
│➽ antivideo
│➽ antiviewonce
│➽ antiimage
│➽ antifile
│➽ tagall
┗▣

┏▣ ◈ *MEDIA COMMANDS* ◈
│────────────────────────
│➽ vv - Download view-once
│➽ save - Save media
┗▣

📢 *Follow our channel for updates!*
${CHANNEL_LINK}`;
}

function getBotInfo() {
  return createStyledMessage("BOT INFORMATION",
    `Version: 2.3.0
Status: ONLINE
Developer: Calyx Drey 
Platform: Node.js + Baileys
Uptime: 24/7 Active

Features
Group Management
Anti-Spam Protection
Media Filtering
Admin Controls
User Management
Media Downloader

Support: @+263786624966`);
}

function getAbout() {
  return createStyledMessage("ABOUT DEVELOPER",
    `Developer Information
Name: Calyx Drey
Experience: 3+ Years
Specialization: WhatsApp Bots
Languages: JavaScript, Python

Bot Features
24/7 Uptime
Secure & Private
Fast Response
Regular Updates
Multi-language Support

Contact
Channel: ${CHANNEL_LINK}
Support: Available 24/7

Thank you for using Viral-Bot Mini! 🥰`);
}

// Helper function to extract quoted message
function getQuotedMessage(m) {
  if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
    return m.message.extendedTextMessage.contextInfo.quotedMessage;
  }
  return null;
}

// Helper function to get quoted participant
function getQuotedParticipant(m) {
  if (m.message?.extendedTextMessage?.contextInfo?.participant) {
    return m.message.extendedTextMessage.contextInfo.participant;
  }
  return null;
}

// Helper function to get message type
function getMessageType(m) {
  const msg = m.message || m;
  const type = Object.keys(msg)[0];
  return type;
}

module.exports = {
  BOT_IMAGE_URL,
  CHANNEL_NAME,
  CHANNEL_LINK,
  NEWSLETTER_JID,
  getBotImage,
  getNewsletterContext,
  createStyledMessage,
  getCommandList,
  getBotInfo,
  getAbout,
  getQuotedMessage,
  getQuotedParticipant,
  getMessageType
};