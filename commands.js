// commands.js - SIMPLIFIED WORKING VERSION
const { 
  BOT_IMAGE_URL, 
  CHANNEL_NAME, 
  CHANNEL_LINK, 
  getNewsletterContext,
  getCommandList,
  getBotInfo,
  getAbout
} = require('./utils');

class CommandHandler {
  constructor(sock) {
    this.sock = sock;
    this.stats = {
      commandsExecuted: 0,
      messagesProcessed: 0
    };
    this.groupSettings = new Map();
  }

  async handleMessage(m) {
    try {
      const jid = m.key.remoteJid;
      if (jid === "status@broadcast" || m.key.fromMe) return;

      this.stats.messagesProcessed++;

      const isGroup = jid.endsWith("@g.us");

      // Initialize group settings
      if (isGroup && !this.groupSettings.has(jid)) {
        this.groupSettings.set(jid, {
          welcome: true,
          antilink: false,
          antisticker: false,
          antiaudio: false
        });
      }

      // Check for anti-features
      if (isGroup) {
        await this.checkAntiFeatures(jid, m);
      }

      // Extract text
      const type = Object.keys(m.message)[0];
      let text = "";
      
      if (type === "conversation") {
        text = m.message.conversation;
      } else if (type === "extendedTextMessage") {
        text = m.message.extendedTextMessage.text;
      } else if (type === "imageMessage" && m.message.imageMessage.caption) {
        text = m.message.imageMessage.caption;
      }

      if (!text || !text.startsWith(".")) return;

      const args = text.slice(1).trim().split(/\s+/);
      const command = args[0].toLowerCase();
      this.stats.commandsExecuted++;

      console.log(`Command: .${command}`);

      // Handle commands
      switch(command) {
        case 'alive':
          return this.handleAlive(jid, m);
        case 'ping':
          return this.handlePing(jid, m);
        case 'menu':
          return this.handleMenu(jid, m);
        case 'help':
          return this.handleHelp(jid, m);
        case 'info':
          return this.handleInfo(jid, m);
        case 'stats':
          return this.handleStats(jid, m);
        case 'about':
          return this.handleAbout(jid, m);
        case 'tagall':
          return this.handleTagAll(jid, isGroup, m);
        default:
          return this.sock.sendMessage(jid, {
            text: `❓ Unknown command: .${command}\nType .help for commands list.`
          }, { quoted: m });
      }
    } catch (error) {
      console.error("Command error:", error.message);
    }
  }

  async checkAntiFeatures(jid, m) {
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    const text = m.message.conversation || 
                 m.message.extendedTextMessage?.text || "";
    
    if (settings.antilink && /https?:\/\//.test(text) && !m.key.fromMe) {
      try {
        await this.sock.sendMessage(jid, {
          text: `⚠️ Links not allowed in this group!`
        });
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {}
    }
  }

  async handleAlive(jid, originalMessage) {
    try {
      const aliveText = `✅ *Viral-Bot Mini is ALIVE!*\n\n` +
                       `⚡ Status: ONLINE\n` +
                       `📊 Version: 2.0.0\n` +
                       `🚀 Response: Active\n\n` +
                       `Type .menu for all commands`;
      
      // Try with image
      try {
        return await this.sock.sendMessage(jid, {
          image: { url: BOT_IMAGE_URL },
          caption: aliveText,
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      } catch (imageError) {
        // Fallback to text
        return await this.sock.sendMessage(jid, {
          text: aliveText,
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
    } catch (error) {
      console.log("Alive command error:", error.message);
    }
  }

  async handleMenu(jid, originalMessage) {
    try {
      const menuText = `🤖 *Viral-Bot Mini Commands*\n\n` +
                      `📋 *General:*\n` +
                      `.alive - Check status\n` +
                      `.ping - Test response\n` +
                      `.menu - This menu\n` +
                      `.help - All commands\n` +
                      `.info - Bot info\n` +
                      `.stats - Statistics\n` +
                      `.about - Developer info\n\n` +
                      `👑 *Group Commands:*\n` +
                      `.tagall - Mention all\n` +
                      `.promote @user - Make admin\n` +
                      `.demote @user - Remove admin\n` +
                      `.kick @user - Remove member\n\n` +
                      `📢 *Channel:* ${CHANNEL_LINK}`;
      
      // Try with image
      try {
        return await this.sock.sendMessage(jid, {
          image: { url: BOT_IMAGE_URL },
          caption: menuText,
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      } catch (imageError) {
        // Fallback to text
        return await this.sock.sendMessage(jid, {
          text: menuText,
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
    } catch (error) {
      console.log("Menu command error:", error.message);
    }
  }

  async handlePing(jid, originalMessage) {
    try {
      const start = Date.now();
      const pingMsg = await this.sock.sendMessage(jid, {
        text: "🏓 Pinging..."
      }, { quoted: originalMessage });
      
      const latency = Date.now() - start;
      
      return this.sock.sendMessage(jid, {
        text: `🏓 PONG!\n\nLatency: ${latency}ms\nStatus: Fast`
      }, { quoted: pingMsg });
    } catch (error) {
      console.log("Ping command error:", error.message);
    }
  }

  async handleHelp(jid, originalMessage) {
    try {
      return await this.sock.sendMessage(jid, {
        text: getCommandList(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.log("Help command error:", error.message);
    }
  }

  async handleInfo(jid, originalMessage) {
    try {
      return await this.sock.sendMessage(jid, {
        text: getBotInfo(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.log("Info command error:", error.message);
    }
  }

  async handleStats(jid, originalMessage) {
    try {
      const statsText = `📊 *Bot Statistics*\n\n` +
                       `Commands: ${this.stats.commandsExecuted}\n` +
                       `Messages: ${this.stats.messagesProcessed}\n` +
                       `Status: Online\n` +
                       `Uptime: 100%`;
      
      return await this.sock.sendMessage(jid, {
        text: statsText,
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.log("Stats command error:", error.message);
    }
  }

  async handleAbout(jid, originalMessage) {
    try {
      return await this.sock.sendMessage(jid, {
        text: getAbout(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.log("About command error:", error.message);
    }
  }

  async handleTagAll(jid, isGroup, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: '❌ This command only works in groups!'
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const participants = meta.participants;
      const mentions = participants.map(p => p.id);
      
      let mentionText = '📢 *MENTION ALL*\n\n';
      participants.forEach((p, i) => {
        mentionText += `@${p.id.split('@')[0]} `;
        if ((i + 1) % 5 === 0) mentionText += '\n';
      });
      
      mentionText += `\n\nTotal: ${participants.length} members`;
      
      return await this.sock.sendMessage(jid, {
        text: mentionText,
        mentions: mentions
      }, { quoted: originalMessage });
    } catch (error) {
      return this.sock.sendMessage(jid, {
        text: '❌ Failed to tag members. Need admin permission.'
      }, { quoted: originalMessage });
    }
  }
}

module.exports = CommandHandler;