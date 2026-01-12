// commands.js
const { 
  BOT_IMAGE_URL, 
  CHANNEL_NAME, 
  CHANNEL_LINK, 
  createStyledMessage, 
  getCommandList 
} = require('./utils');

class CommandHandler {
  constructor(sock) {
    this.sock = sock;
  }

  async handleMessage(m) {
    const jid = m.key.remoteJid;
    if (jid === "status@broadcast") return;

    const isGroup = jid.endsWith("@g.us");
    const sender = isGroup ? m.key.participant || jid : jid;

    // Button click handler
    if (m.message.buttonsResponseMessage) {
      const btn = m.message.buttonsResponseMessage.selectedButtonId;
      if (btn === "open_channel") {
        return this.sock.sendMessage(jid, {
          text: `📢 *${CHANNEL_NAME}*\n\nFollow our WhatsApp Channel:\n${CHANNEL_LINK}`
        });
      }
    }

    // Extract text from message
    const type = Object.keys(m.message)[0];
    const text = type === "conversation"
      ? m.message.conversation
      : type === "extendedTextMessage"
      ? m.message.extendedTextMessage.text
      : "";

    if (!text || !text.startsWith(".")) return;

    // Prevent reply loops
    const isBotEcho = m.key.fromMe && 
      m.message.extendedTextMessage?.contextInfo?.stanzaId;
    if (isBotEcho) return;

    const command = text.slice(1).toLowerCase().trim();

    // Route command to appropriate handler
    switch(command) {
      case 'alive':
        return this.handleAlive(jid);
      case 'ping':
        return this.handlePing(jid);
      case 'menu':
        return this.handleMenu(jid);
      case 'tagall':
        return this.handleTagAll(jid, isGroup, sender);
      case 'mute':
        return this.handleMute(jid, isGroup, sender, true);
      case 'unmute':
        return this.handleMute(jid, isGroup, sender, false);
      case 'help':
        return this.handleHelp(jid);
      default:
        return null;
    }
  }

  async handleAlive(jid) {
    return this.sock.sendMessage(jid, {
      image: { url: BOT_IMAGE_URL },
      caption: createStyledMessage("SYSTEM STATUS", 
        "✅ Viral-Bot Mini is Alive & Running\n\nStatus: ONLINE\nUptime: 100%\nVersion: 2.0.0")
    });
  }

  async handlePing(jid) {
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("PING TEST", 
        "🏓 PONG!\nResponse: Instant\nStatus: Optimal")
    });
  }

  async handleMenu(jid) {
    return this.sock.sendMessage(jid, {
      image: { url: BOT_IMAGE_URL },
      caption: getCommandList(),
      buttons: [{
        buttonId: "open_channel",
        buttonText: { displayText: "📢 View Channel" },
        type: 1
      }],
      headerType: 1
    });
  }

  async handleTagAll(jid, isGroup, sender) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!")
      });
    }

    const meta = await this.sock.groupMetadata(jid);
    const mentions = meta.participants.map(p => p.id);
    const mentionList = mentions.map(u => `@${u.split("@")[0]}`).join(" ");

    return this.sock.sendMessage(jid, {
      text: createStyledMessage("GROUP ACTION",
        `📣 TAG ALL MEMBERS\n\nTotal: ${mentions.length} members\n\n${mentionList}`),
      mentions
    });
  }

  async handleMute(jid, isGroup, sender, shouldMute) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!")
      });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ Only admins can use this command!")
      });
    }

    await this.sock.groupSettingUpdate(
      jid,
      shouldMute ? "announcement" : "not_announcement"
    );

    const action = shouldMute ? "🔇 GROUP MUTED" : "🔊 GROUP UNMUTED";
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("ADMIN ACTION",
        `${action}\nGroup: ${meta.subject}\nAction by: @${sender.split("@")[0]}`)
    });
  }

  async handleHelp(jid) {
    return this.sock.sendMessage(jid, {
      text: getCommandList()
    });
  }
}

module.exports = CommandHandler;
