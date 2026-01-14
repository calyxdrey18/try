const { 
  BOT_IMAGE_URL, 
  CHANNEL_LINK,
  getCommandList,
  getBotInfo,
  getAbout
} = require('./utils');

class CommandHandler {
  constructor(sock) {
    this.sock = sock;
    this.stats = { commandsExecuted: 0, messagesProcessed: 0 };
  }

  async handleMessage(m) {
    try {
      const jid = m.key.remoteJid;
      if (jid === 'status@broadcast' || m.key.fromMe) return;

      this.stats.messagesProcessed++;

      // Get message text
      let text = '';
      const msgType = Object.keys(m.message)[0];
      
      if (msgType === 'conversation') {
        text = m.message.conversation;
      } else if (msgType === 'extendedTextMessage') {
        text = m.message.extendedTextMessage.text || '';
      } else if (msgType === 'imageMessage') {
        text = m.message.imageMessage.caption || '';
      }

      // Check if it's a command
      if (!text.startsWith('.')) return;

      const args = text.slice(1).split(' ');
      const command = args[0].toLowerCase();
      this.stats.commandsExecuted++;

      console.log(`Command: .${command}`);

      // Handle commands
      switch(command) {
        case 'alive':
          await this.handleAlive(jid, m);
          break;
        case 'ping':
          await this.handlePing(jid, m);
          break;
        case 'menu':
          await this.handleMenu(jid, m);
          break;
        case 'help':
          await this.handleHelp(jid, m);
          break;
        case 'info':
          await this.handleInfo(jid, m);
          break;
        case 'stats':
          await this.handleStats(jid, m);
          break;
        case 'about':
          await this.handleAbout(jid, m);
          break;
        case 'tagall':
          await this.handleTagAll(jid, m);
          break;
        default:
          await this.sock.sendMessage(jid, {
            text: `❓ Unknown command: .${command}\nType .help for commands.`
          }, { quoted: m });
      }
    } catch (error) {
      console.log('Command error:', error.message);
    }
  }

  async handleAlive(jid, originalMessage) {
    try {
      const aliveText = `✅ *Viral-Bot Mini is ALIVE!*\n\n` +
                       `⚡ Status: ONLINE\n` +
                       `📊 Version: 2.0.0\n` +
                       `🚀 Commands: Active\n\n` +
                       `Type .menu for all commands`;
      
      // Try with image
      try {
        await this.sock.sendMessage(jid, {
          image: { url: BOT_IMAGE_URL },
          caption: aliveText
        }, { quoted: originalMessage });
      } catch (imageError) {
        // Fallback to text
        await this.sock.sendMessage(jid, {
          text: aliveText
        }, { quoted: originalMessage });
      }
    } catch (error) {
      console.log('Alive command error:', error.message);
    }
  }

  async handleMenu(jid, originalMessage) {
    try {
      const menuText = `🤖 *Viral-Bot Mini Commands Menu*\n\n` +
                      `📋 *General Commands:*\n` +
                      `• .alive - Check bot status\n` +
                      `• .ping - Test response\n` +
                      `• .menu - Show this menu\n` +
                      `• .help - All commands\n` +
                      `• .info - Bot info\n` +
                      `• .stats - Statistics\n` +
                      `• .about - About developer\n\n` +
                      `👑 *Group Commands:*\n` +
                      `• .tagall - Mention everyone\n` +
                      `• .promote - Make admin\n` +
                      `• .demote - Remove admin\n` +
                      `• .kick - Remove member\n` +
                      `• .mute - Close group\n` +
                      `• .unmute - Open group\n\n` +
                      `📢 *Channel:* ${CHANNEL_LINK}`;
      
      // Try with image
      try {
        await this.sock.sendMessage(jid, {
          image: { url: BOT_IMAGE_URL },
          caption: menuText
        }, { quoted: originalMessage });
      } catch (imageError) {
        // Fallback to text
        await this.sock.sendMessage(jid, {
          text: menuText
        }, { quoted: originalMessage });
      }
    } catch (error) {
      console.log('Menu command error:', error.message);
    }
  }

  async handlePing(jid, originalMessage) {
    try {
      const start = Date.now();
      
      await this.sock.sendMessage(jid, {
        text: `🏓 PONG!\n\nLatency: ${Date.now() - start}ms\nStatus: Fast`
      }, { quoted: originalMessage });
    } catch (error) {
      console.log('Ping command error:', error.message);
    }
  }

  async handleHelp(jid, originalMessage) {
    try {
      await this.sock.sendMessage(jid, {
        text: getCommandList()
      }, { quoted: originalMessage });
    } catch (error) {
      console.log('Help command error:', error.message);
    }
  }

  async handleInfo(jid, originalMessage) {
    try {
      await this.sock.sendMessage(jid, {
        text: getBotInfo()
      }, { quoted: originalMessage });
    } catch (error) {
      console.log('Info command error:', error.message);
    }
  }

  async handleStats(jid, originalMessage) {
    try {
      const statsText = `📊 *Bot Statistics*\n\n` +
                       `Commands: ${this.stats.commandsExecuted}\n` +
                       `Messages: ${this.stats.messagesProcessed}\n` +
                       `Status: Online\n` +
                       `Uptime: 100%`;
      
      await this.sock.sendMessage(jid, {
        text: statsText
      }, { quoted: originalMessage });
    } catch (error) {
      console.log('Stats command error:', error.message);
    }
  }

  async handleAbout(jid, originalMessage) {
    try {
      await this.sock.sendMessage(jid, {
        text: getAbout()
      }, { quoted: originalMessage });
    } catch (error) {
      console.log('About command error:', error.message);
    }
  }

  async handleTagAll(jid, originalMessage) {
    try {
      const isGroup = jid.endsWith('@g.us');
      if (!isGroup) {
        await this.sock.sendMessage(jid, {
          text: '❌ This command only works in groups!'
        }, { quoted: originalMessage });
        return;
      }

      const metadata = await this.sock.groupMetadata(jid);
      const participants = metadata.participants;
      const mentions = participants.map(p => p.id);
      
      let mentionText = '📢 *MENTION ALL*\n\n';
      participants.forEach((p, i) => {
        mentionText += `@${p.id.split('@')[0]} `;
        if ((i + 1) % 5 === 0) mentionText += '\n';
      });
      
      mentionText += `\n\nTotal: ${participants.length} members`;
      
      await this.sock.sendMessage(jid, {
        text: mentionText,
        mentions: mentions
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: '❌ Failed to tag members. Need admin permission.'
      }, { quoted: originalMessage });
    }
  }
}

module.exports = CommandHandler;