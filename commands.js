const { 
  BOT_IMAGE_URL, 
  getNewsletterContext, 
  createStyledMessage, 
  getCommandList 
} = require('./utils');
const axios = require('axios');

class CommandHandler {
  constructor(sock) {
    this.sock = sock;
  }

  async getBuffer(url) {
    try {
      const res = await axios({ method: 'get', url, responseType: 'arraybuffer' });
      return Buffer.from(res.data, 'binary');
    } catch (e) { return null; }
  }

  async sendReply(jid, content, quoted) {
    return await this.sock.sendMessage(jid, { 
      ...content, 
      contextInfo: getNewsletterContext() 
    }, { quoted });
  }

  async handleMessage(m) {
    const jid = m.key.remoteJid;
    if (!m.message || m.key.fromMe) return;

    const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "";
    if (!text.startsWith('.')) return;

    const command = text.slice(1).trim().split(' ')[0].toLowerCase();

    switch (command) {
      case 'ping':
        const start = Date.now();
        await this.sendReply(jid, { text: `*Pong!* 🏓\nSpeed: ${Date.now() - start}ms` }, m);
        break;

      case 'alive':
        const img = await this.getBuffer(BOT_IMAGE_URL);
        if (img) {
          await this.sendReply(jid, { image: img, caption: createStyledMessage("STATUS", "Bot is Active ✅") }, m);
        } else {
          await this.sendReply(jid, { text: "*Bot is Active ✅*" }, m);
        }
        break;

      case 'menu':
      case 'help':
        const menuImg = await this.getBuffer(BOT_IMAGE_URL);
        if (menuImg) {
          await this.sendReply(jid, { image: menuImg, caption: getCommandList() }, m);
        } else {
          await this.sendReply(jid, { text: getCommandList() }, m);
        }
        break;

      case 'info':
        await this.sendReply(jid, { text: createStyledMessage("INFO", "Viral-Bot Mini\nVersion: 2.3.0\nLibrary: Baileys") }, m);
        break;

      case 'about':
        await this.sendReply(jid, { text: "Created by Calyx Drey. A lightweight WhatsApp Bot." }, m);
        break;
    }
  }
}

module.exports = CommandHandler;