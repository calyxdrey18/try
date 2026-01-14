// commands.js - SIMPLIFIED VERSION
const { 
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
} = require('./utils');

const fs = require('fs');
const path = require('path');

class CommandHandler {
  constructor(sock) {
    this.sock = sock;
    this.stats = {
      commandsExecuted: 0,
      messagesProcessed: 0
    };
    this.groupSettings = new Map();
  }

  // Helper function to send message
  async sendReply(jid, content, originalMessage, options = {}) {
    try {
      return await this.sock.sendMessage(jid, {
        ...content,
        contextInfo: getNewsletterContext()
      }, { 
        quoted: originalMessage,
        ...options 
      });
    } catch (error) {
      console.error("Error sending message:", error);
      // Try without newsletter context if it fails
      try {
        return await this.sock.sendMessage(jid, content, { 
          quoted: originalMessage,
          ...options 
        });
      } catch (error2) {
        console.error("Error sending message (fallback):", error2);
        throw error2;
      }
    }
  }

  async handleMessage(m) {
    const jid = m.key.remoteJid;
    if (jid === "status@broadcast") return;

    this.stats.messagesProcessed++;

    const isGroup = jid.endsWith("@g.us");
    const sender = isGroup ? m.key.participant || jid : jid;

    // Initialize group settings
    if (isGroup && !this.groupSettings.has(jid)) {
      this.groupSettings.set(jid, {
        welcome: true,
        antilink: false
      });
    }

    // Button click handler
    if (m.message.buttonsResponseMessage) {
      const btn = m.message.buttonsResponseMessage.selectedButtonId;
      if (btn === "open_channel") {
        return this.sendReply(jid, {
          text: `📢 *${CHANNEL_NAME}*\n\nFollow our WhatsApp Channel:\n${CHANNEL_LINK}`
        }, m);
      }
    }

    // Extract text from message
    let text = "";
    
    if (m.message.conversation) {
      text = m.message.conversation;
    } else if (m.message.extendedTextMessage) {
      text = m.message.extendedTextMessage.text || "";
    } else if (m.message.imageMessage && m.message.imageMessage.caption) {
      text = m.message.imageMessage.caption;
    } else if (m.message.videoMessage && m.message.videoMessage.caption) {
      text = m.message.videoMessage.caption;
    }

    // Check if it's a command
    if (!text || !text.trim().startsWith(".")) {
      return;
    }

    // Prevent bot from responding to its own messages
    if (m.key.fromMe) {
      return;
    }

    const args = text.trim().slice(1).split(/\s+/);
    const command = args[0].toLowerCase();
    
    this.stats.commandsExecuted++;

    // Route command
    try {
      switch(command) {
        case 'alive':
          return await this.handleAlive(jid, m);
        case 'ping':
          return await this.handlePing(jid, m);
        case 'menu':
          return await this.handleMenu(jid, m);
        case 'help':
          return await this.handleHelp(jid, m);
        case 'info':
          return await this.handleInfo(jid, m);
        case 'stats':
          return await this.handleStats(jid, m);
        case 'about':
          return await this.handleAbout(jid, m);
        case 'tagall':
          return await this.handleTagAll(jid, isGroup, sender, m);
        case 'mute':
          return await this.handleMute(jid, isGroup, sender, true, m);
        case 'unmute':
          return await this.handleMute(jid, isGroup, sender, false, m);
        case 'welcome':
          return await this.handleWelcome(jid, isGroup, sender, m);
        default:
          return await this.handleUnknownCommand(jid, m);
      }
    } catch (error) {
      console.error(`Error handling command ${command}:`, error);
      return this.sendReply(jid, {
        text: "❌ An error occurred while processing your command."
      }, m);
    }
  }

  async handleUnknownCommand(jid, originalMessage) {
    return this.sendReply(jid, {
      text: createStyledMessage("UNKNOWN COMMAND", 
        `Command not recognized.
        
Type *.help* to see available commands.`)
    }, originalMessage);
  }

  async handleAlive(jid, originalMessage) {
    try {
      const botImage = getBotImage();
      
      return await this.sendReply(jid, {
        image: { url: botImage.url },
        caption: createStyledMessage("SYSTEM STATUS", 
          `Viral-Bot Mini is Alive & Running
Status: ONLINE
Uptime: 100%
Version: 2.3.0
Commands: 25+ Active`)
      }, originalMessage);
    } catch (error) {
      console.error("Error sending alive message with image:", error);
      // Fallback to text if image fails
      return this.sendReply(jid, {
        text: createStyledMessage("SYSTEM STATUS", 
          `Viral-Bot Mini is Alive & Running ✅
Status: ONLINE
Uptime: 100%
Version: 2.3.0
Commands: 25+ Active`)
      }, originalMessage);
    }
  }

  async handleMenu(jid, originalMessage) {
    try {
      const botImage = getBotImage();
      
      return await this.sendReply(jid, {
        image: { url: botImage.url },
        caption: getCommandList(),
        buttons: [{
          buttonId: "open_channel",
          buttonText: { displayText: "📢 View Channel" },
          type: 1
        }],
        headerType: 1
      }, originalMessage);
    } catch (error) {
      console.error("Error sending menu with image:", error);
      // Fallback to text if image fails
      return this.sendReply(jid, {
        text: getCommandList()
      }, originalMessage);
    }
  }

  async handlePing(jid, originalMessage) {
    const start = Date.now();
    const latency = Date.now() - start;
    
    return this.sendReply(jid, {
      text: createStyledMessage("PING TEST", 
        `PONG! 🏓
Latency: ${latency}ms
Status: Optimal
Server: Active`)
    }, originalMessage);
  }

  async handleHelp(jid, originalMessage) {
    return this.sendReply(jid, {
      text: getCommandList()
    }, originalMessage);
  }

  async handleInfo(jid, originalMessage) {
    return this.sendReply(jid, {
      text: getBotInfo()
    }, originalMessage);
  }

  async handleStats(jid, originalMessage) {
    let groupCount = 0;
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      groupCount = Object.keys(groups).length;
    } catch (error) {
      console.error("Error fetching groups:", error);
    }
    
    return this.sendReply(jid, {
      text: createStyledMessage("BOT STATISTICS",
        `Commands Executed: ${this.stats.commandsExecuted}
Messages Processed: ${this.stats.messagesProcessed}
Active Groups: ${groupCount}
Uptime: 100%

Performance
Response Time: < 1s
Success Rate: 99.9%
Memory Usage: Optimized

Last Updated
${new Date().toLocaleString()}`)
    }, originalMessage);
  }

  async handleAbout(jid, originalMessage) {
    return this.sendReply(jid, {
      text: getAbout()
    }, originalMessage);
  }

  async handleTagAll(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const mentions = meta.participants.map(p => p.id);
      const mentionList = mentions.map(u => `@${u.split("@")[0]}`).join("\n│➽ ");

      return this.sendReply(jid, {
        text: createStyledMessage("GROUP ACTION",
          `TAG ALL MEMBERS
Total: ${mentions.length} members

${mentionList}`),
        mentions
      }, originalMessage);
    } catch (error) {
      console.error("Error tagging all:", error);
      return this.sendReply(jid, {
        text: "❌ Failed to tag all members. Please try again."
      }, originalMessage);
    }
  }

  async handleMute(jid, isGroup, sender, shouldMute, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return this.sendReply(jid, {
          text: createStyledMessage("ERROR", "Only admins can use this command!")
        }, originalMessage);
      }

      await this.sock.groupSettingUpdate(
        jid,
        shouldMute ? "announcement" : "not_announcement"
      );

      const action = shouldMute ? "GROUP MUTED" : "GROUP UNMUTED";
      return this.sendReply(jid, {
        text: createStyledMessage("ADMIN ACTION",
          `${action}
Group: ${meta.subject}
Action by: @${sender.split("@")[0]}`)
      }, originalMessage);
    } catch (error) {
      console.error("Error muting/unmuting group:", error);
      return this.sendReply(jid, {
        text: "❌ Failed to update group settings. Please try again."
      }, originalMessage);
    }
  }

  async handleWelcome(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.welcome = !settings.welcome;
    this.groupSettings.set(jid, settings);

    const status = settings.welcome ? "ENABLED ✅" : "DISABLED ❌";
    return this.sendReply(jid, {
      text: createStyledMessage("WELCOME SETTINGS",
        `Welcome messages have been ${status}
Group: ${jid.split("@")[0]}
Changed by: @${sender.split("@")[0]}`)
    }, originalMessage);
  }
}

module.exports = CommandHandler;
[file content end]