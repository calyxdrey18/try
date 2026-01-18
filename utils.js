// utils.js
const BOT_IMAGE_URL = "https://img.sanishtech.com/u/d52d507c27a7919e9e19448a073ba4cb.jpg";
const CHANNEL_NAME = "Viral-Bot Mini Updates";
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbCGIzTJkK7C0wtGy31s";
const NEWSLETTER_JID = "120363405637529316@newsletter";

// Function to ensure image URL is valid
function getBotImage() {
  // Return a guaranteed working image URL
  const workingImage = "https://img.sanishtech.com/u/d52d507c27a7919e9e19448a073ba4cb.jpg";
  const fallbackImage = "https://telegra.ph/file/87a3b8a3c7e7d6b3c9c9d.jpg";
  
  return {
    url: workingImage,
    fallback: fallbackImage,
    mimetype: 'image/jpeg'
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
  const border = "в”Ђ".repeat(25);
  return `в”Џв–Ј в—€ *${title}* в—€
в”‚${border}
в”‚${content.split('\n').map(line => `в”‚вћЅ ${line}`).join('\n')}
в”—в–Ј`;
}

function getCommandList() {
  return `в”Џв–Ј в—€ *VIRAL-BOT MINI* в—€
в”‚в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
в”‚вћЅ help
в”‚вћЅ info
в”‚вћЅ stats
в”‚вћЅ about
в”‚вћЅ ping
в”‚вћЅ alive
в”‚вћЅ menu
в”—в–Ј

в”Џв–Ј в—€ *GROUP MANAGEMENT* в—€
в”‚в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
в”‚вћЅ welcome        
в”‚вћЅ promote @user   
в”‚вћЅ demote  @user   
в”‚вћЅ kick    @user
в”‚вћЅ setdesc
в”‚вћЅ setpp
в”‚вћЅ mute
в”‚вћЅ unmute
в”‚вћЅ antilink
в”‚вћЅ antisticker
в”‚вћЅ antiaudio
в”‚вћЅ antivideo
в”‚вћЅ antiviewonce
в”‚вћЅ antiimage
в”‚вћЅ antifile
в”‚вћЅ tagall
в”—в–Ј

в”Џв–Ј в—€ *MEDIA COMMANDS* в—€
в”‚в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
в”‚вћЅ vv - Download view-once
в”‚вћЅ save - Save media
в”—в–Ј

рџ"ў *Follow our channel for updates!*
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

Thank you for using Viral-Bot Mini! рџҐ°`);
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