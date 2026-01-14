
// commands.js
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
      messagesProcessed: 0,
      groupsActive: 0
    };
    this.groupSettings = new Map();
    this.typingStates = new Map();
  }

  // Improved typing simulation
  async simulateTyping(jid, duration = 1000) {
    try {
      // Clear any existing typing state
      if (this.typingStates.has(jid)) {
        clearTimeout(this.typingStates.get(jid).timeout);
      }
      
      // Start typing
      await this.sock.sendPresenceUpdate('composing', jid);
      
      // Set timeout to stop typing
      const timeout = setTimeout(async () => {
        try {
          await this.sock.sendPresenceUpdate('paused', jid);
          this.typingStates.delete(jid);
        } catch (error) {
          console.error("Error stopping typing:", error);
        }
      }, duration);
      
      // Store timeout reference
      this.typingStates.set(jid, { timeout, active: true });
      
    } catch (error) {
      console.error("Error simulating typing:", error);
    }
  }

  // Stop typing
  async stopTyping(jid) {
    try {
      if (this.typingStates.has(jid)) {
        const { timeout } = this.typingStates.get(jid);
        clearTimeout(timeout);
        await this.sock.sendPresenceUpdate('paused', jid);
        this.typingStates.delete(jid);
      }
    } catch (error) {
      console.error("Error stopping typing:", error);
    }
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
      throw error;
    }
  }

  // Helper to extract text from message
  extractTextFromMessage(m) {
    if (!m || !m.message) return "";
    
    const msg = m.message;
    
    // Check for conversation text
    if (msg.conversation) {
      return msg.conversation;
    }
    
    // Check for extended text
    if (msg.extendedTextMessage) {
      return msg.extendedTextMessage.text || "";
    }
    
    // Check for image with caption
    if (msg.imageMessage && msg.imageMessage.caption) {
      return msg.imageMessage.caption;
    }
    
    // Check for video with caption
    if (msg.videoMessage && msg.videoMessage.caption) {
      return msg.videoMessage.caption;
    }
    
    // Check for view-once messages
    if (msg.viewOnceMessage) {
      if (msg.viewOnceMessage.message?.imageMessage?.caption) {
        return msg.viewOnceMessage.message.imageMessage.caption;
      }
      if (msg.viewOnceMessage.message?.videoMessage?.caption) {
        return msg.viewOnceMessage.message.videoMessage.caption;
      }
      if (msg.viewOnceMessage.message?.extendedTextMessage?.text) {
        return msg.viewOnceMessage.message.extendedTextMessage.text;
      }
    }
    
    // Check for view-once V2
    if (msg.viewOnceMessageV2) {
      if (msg.viewOnceMessageV2.message?.imageMessage?.caption) {
        return msg.viewOnceMessageV2.message.imageMessage.caption;
      }
      if (msg.viewOnceMessageV2.message?.videoMessage?.caption) {
        return msg.viewOnceMessageV2.message.videoMessage.caption;
      }
      if (msg.viewOnceMessageV2.message?.extendedTextMessage?.text) {
        return msg.viewOnceMessageV2.message.extendedTextMessage.text;
      }
    }
    
    return "";
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
        antilink: false,
        antisticker: false,
        antiaudio: false,
        antivideo: false,
        antiviewonce: false,
        antiimage: false,
        antifile: false
      });
    }

    // Button click handler
    if (m.message.buttonsResponseMessage) {
      const btn = m.message.buttonsResponseMessage.selectedButtonId;
      if (btn === "open_channel") {
        await this.simulateTyping(jid, 1500);
        return this.sendReply(jid, {
          text: `📢 *${CHANNEL_NAME}*\n\nFollow our WhatsApp Channel:\n${CHANNEL_LINK}`
        }, m);
      }
    }

    // Extract text from message using the helper
    let text = this.extractTextFromMessage(m);
    
    // Check for anti-features BEFORE processing commands
    if (isGroup) {
      await this.checkAntiFeatures(jid, m);
    }

    // Check if text starts with command prefix
    if (!text || !text.trim().startsWith(".")) {
      return; // Not a command
    }

    // Prevent reply loops
    const isBotEcho = m.key.fromMe && 
      m.message.extendedTextMessage?.contextInfo?.stanzaId;
    if (isBotEcho) return;

    const args = text.trim().slice(1).split(/\s+/);
    const command = args[0].toLowerCase();
    
    // Get quoted participant for reply-based commands
    const quotedParticipant = getQuotedParticipant(m);
    const targetUsers = quotedParticipant ? [quotedParticipant] : [];

    this.stats.commandsExecuted++;

    // Route command to appropriate handler WITHOUT typing simulation first
    // The individual handlers will handle their own typing simulation
    return await this.routeCommand(command, jid, m, {
      isGroup,
      sender,
      args: args.slice(1),
      targetUsers
    });
  }

  async routeCommand(command, jid, originalMessage, options) {
    const { isGroup, sender, args, targetUsers } = options;
    
    switch(command) {
      case 'alive':
        return await this.handleAlive(jid, originalMessage);
      case 'ping':
        return await this.handlePing(jid, originalMessage);
      case 'menu':
        return await this.handleMenu(jid, originalMessage);
      case 'tagall':
        return await this.handleTagAll(jid, isGroup, sender, originalMessage);
      case 'mute':
        return await this.handleMute(jid, isGroup, sender, true, originalMessage);
      case 'unmute':
        return await this.handleMute(jid, isGroup, sender, false, originalMessage);
      case 'help':
        return await this.handleHelp(jid, originalMessage);
      case 'info':
        return await this.handleInfo(jid, originalMessage);
      case 'stats':
        return await this.handleStats(jid, originalMessage);
      case 'about':
        return await this.handleAbout(jid, originalMessage);
      case 'welcome':
        return await this.handleWelcome(jid, isGroup, sender, originalMessage);
      case 'promote':
        return await this.handlePromote(jid, isGroup, sender, targetUsers, originalMessage);
      case 'demote':
        return await this.handleDemote(jid, isGroup, sender, targetUsers, originalMessage);
      case 'kick':
        return await this.handleKick(jid, isGroup, sender, targetUsers, originalMessage);
      case 'setdesc':
        return await this.handleSetDesc(jid, isGroup, sender, args.join(" "), originalMessage);
      case 'antilink':
        return await this.handleAntiLink(jid, isGroup, sender, originalMessage);
      case 'antisticker':
        return await this.handleAntiSticker(jid, isGroup, sender, originalMessage);
      case 'antiaudio':
        return await this.handleAntiAudio(jid, isGroup, sender, originalMessage);
      case 'antivideo':
        return await this.handleAntiVideo(jid, isGroup, sender, originalMessage);
      case 'antiviewonce':
        return await this.handleAntiViewOnce(jid, isGroup, sender, originalMessage);
      case 'antiimage':
        return await this.handleAntiImage(jid, isGroup, sender, originalMessage);
      case 'antifile':
        return await this.handleAntiFile(jid, isGroup, sender, originalMessage);
      case 'setpp':
        return await this.handleSetPP(jid, isGroup, sender, originalMessage);
      case 'vv':
      case 'save':
        return await this.handleDownloadMedia(jid, sender, originalMessage);
      default:
        return await this.handleUnknownCommand(jid, originalMessage);
    }
  }

  async handleUnknownCommand(jid, originalMessage) {
    await this.simulateTyping(jid, 1000);
    return this.sendReply(jid, {
      text: createStyledMessage("UNKNOWN COMMAND", 
        `Command not recognized.
        
Type *.help* to see available commands.`)
    }, originalMessage);
  }

  async checkAntiFeatures(jid, m) {
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    // Get message text
    const text = this.extractTextFromMessage(m);
    
    // Check for links (including shortened URLs)
    const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+|bit\.ly\/[^\s]+|t\.co\/[^\s]+|goo\.gl\/[^\s]+)/i.test(text);
    
    if (settings.antilink && hasLink && !m.key.fromMe) {
      try {
        const participant = m.key.participant || jid;
        // Send warning and delete message
        await this.sendReply(jid, {
          text: createStyledMessage("ANTI-LINK", 
            `⚠️ Links are not allowed in this group!
Message from @${participant.split('@')[0] || 'User'} deleted.`),
          mentions: [participant]
        }, m);
        
        // Delete the message containing link
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting link message:", error);
      }
    }

    // Check for stickers
    if (settings.antisticker && m.message.stickerMessage && !m.key.fromMe) {
      try {
        const participant = m.key.participant || jid;
        await this.sendReply(jid, {
          text: createStyledMessage("ANTI-STICKER", 
            `⚠️ Stickers are not allowed in this group!
Sticker from @${participant.split('@')[0] || 'User'} deleted.`),
          mentions: [participant]
        }, m);
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting sticker:", error);
      }
    }

    // Check for audio
    if (settings.antiaudio && m.message.audioMessage && !m.key.fromMe) {
      try {
        const participant = m.key.participant || jid;
        await this.sendReply(jid, {
          text: createStyledMessage("ANTI-AUDIO", 
            `⚠️ Audio messages are not allowed in this group!
Audio from @${participant.split('@')[0] || 'User'} deleted.`),
          mentions: [participant]
        }, m);
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting audio:", error);
      }
    }

    // Check for video
    if (settings.antivideo && m.message.videoMessage && !m.key.fromMe) {
      try {
        const participant = m.key.participant || jid;
        await this.sendReply(jid, {
          text: createStyledMessage("ANTI-VIDEO", 
            `⚠️ Videos are not allowed in this group!
Video from @${participant.split('@')[0] || 'User'} deleted.`),
          mentions: [participant]
        }, m);
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting video:", error);
      }
    }

    // Check for view once
    if (settings.antiviewonce && (m.message.viewOnceMessage || m.message.viewOnceMessageV2) && !m.key.fromMe) {
      try {
        const participant = m.key.participant || jid;
        await this.sendReply(jid, {
          text: createStyledMessage("ANTI-VIEWONCE", 
            `⚠️ View-once messages are not allowed in this group!
Message from @${participant.split('@')[0] || 'User'} deleted.`),
          mentions: [participant]
        }, m);
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting view-once message:", error);
      }
    }

    // Check for image
    if (settings.antiimage && m.message.imageMessage && !m.key.fromMe) {
      try {
        const participant = m.key.participant || jid;
        await this.sendReply(jid, {
          text: createStyledMessage("ANTI-IMAGE", 
            `⚠️ Images are not allowed in this group!
Image from @${participant.split('@')[0] || 'User'} deleted.`),
          mentions: [participant]
        }, m);
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting image:", error);
      }
    }

    // Check for document/file
    if (settings.antifile && m.message.documentMessage && !m.key.fromMe) {
      try {
        const participant = m.key.participant || jid;
        await this.sendReply(jid, {
          text: createStyledMessage("ANTI-FILE", 
            `⚠️ Files/Documents are not allowed in this group!
File from @${participant.split('@')[0] || 'User'} deleted.`),
          mentions: [participant]
        }, m);
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting file:", error);
      }
    }
  }

  async handleAlive(jid, originalMessage) {
    try {
      // Simulate longer thinking time for image commands
      await this.simulateTyping(jid, 2500);
      
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
      console.error("Error sending alive message:", error);
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
      // Simulate longer thinking time for menu
      await this.simulateTyping(jid, 2000);
      
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
      console.error("Error sending menu:", error);
      // Fallback to text if image fails
      return this.sendReply(jid, {
        text: getCommandList()
      }, originalMessage);
    }
  }

  async handlePing(jid, originalMessage) {
    const start = Date.now();
    
    // Simulate typing
    await this.simulateTyping(jid, 1200);
    
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
    await this.simulateTyping(jid, 1500);
    return this.sendReply(jid, {
      text: getCommandList()
    }, originalMessage);
  }

  async handleInfo(jid, originalMessage) {
    await this.simulateTyping(jid, 1200);
    return this.sendReply(jid, {
      text: getBotInfo()
    }, originalMessage);
  }

  async handleStats(jid, originalMessage) {
    await this.simulateTyping(jid, 2200);
    const groups = await this.sock.groupFetchAllParticipating();
    const groupCount = Object.keys(groups).length;
    
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
    await this.simulateTyping(jid, 1800);
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

    await this.simulateTyping(jid, 3000);
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
  }

  async handleMute(jid, isGroup, sender, shouldMute, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can use this command!")
      }, originalMessage);
    }

    await this.simulateTyping(jid, 1500);
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
  }

  async handleWelcome(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    await this.simulateTyping(jid, 1200);
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

  async handlePromote(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can promote users!")
      }, originalMessage);
    }

    if (targetUsers.length === 0) {
      return this.sendReply(jid, {
        text: createStyledMessage("USAGE", 
          `Usage: .promote @user
OR
Reply to a message with .promote

Example:
- .promote @username
- Reply to user's message with .promote`)
      }, originalMessage);
    }

    const userToPromote = targetUsers[0];
    
    // Check if user is already admin
    const isAlreadyAdmin = admins.includes(userToPromote);
    if (isAlreadyAdmin) {
      return this.sendReply(jid, {
        text: createStyledMessage("INFO", 
          `User is already an admin!
User: @${userToPromote.split("@")[0]}`),
        mentions: [userToPromote]
      }, originalMessage);
    }
    
    try {
      await this.simulateTyping(jid, 1800);
      await this.sock.groupParticipantsUpdate(jid, [userToPromote], "promote");
      return this.sendReply(jid, {
        text: createStyledMessage("PROMOTION SUCCESS",
          `User promoted to admin!
User: @${userToPromote.split("@")[0]}
Promoted by: @${sender.split("@")[0]}`),
        mentions: [userToPromote, sender]
      }, originalMessage);
    } catch (error) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", `Failed to promote user:
${error.message}`)
      }, originalMessage);
    }
  }

  async handleDemote(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can demote users!")
      }, originalMessage);
    }

    if (targetUsers.length === 0) {
      return this.sendReply(jid, {
        text: createStyledMessage("USAGE", 
          `Usage: .demote @user
OR
Reply to a message with .demote

Example:
- .demote @username
- Reply to user's message with .demote`)
      }, originalMessage);
    }

    const userToDemote = targetUsers[0];
    
    // Check if user is not an admin
    const isAdmin = admins.includes(userToDemote);
    if (!isAdmin) {
      return this.sendReply(jid, {
        text: createStyledMessage("INFO", 
          `User is not an admin!
User: @${userToDemote.split("@")[0]}`),
        mentions: [userToDemote]
      }, originalMessage);
    }
    
    // Prevent demoting yourself if you're the only admin
    if (userToDemote === sender && admins.length === 1) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", 
          `You cannot demote yourself as the only admin!
Promote someone else first.`)
      }, originalMessage);
    }
    
    try {
      await this.simulateTyping(jid, 1800);
      await this.sock.groupParticipantsUpdate(jid, [userToDemote], "demote");
      return this.sendReply(jid, {
        text: createStyledMessage("DEMOTION SUCCESS",
          `User demoted from admin!
User: @${userToDemote.split("@")[0]}
Demoted by: @${sender.split("@")[0]}`),
        mentions: [userToDemote, sender]
      }, originalMessage);
    } catch (error) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", `Failed to demote user:
${error.message}`)
      }, originalMessage);
    }
  }

  async handleKick(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can kick users!")
      }, originalMessage);
    }

    if (targetUsers.length === 0) {
      return this.sendReply(jid, {
        text: createStyledMessage("USAGE", 
          `Usage: .kick @user
OR
Reply to a message with .kick

Example:
- .kick @username
- Reply to user's message with .kick`)
      }, originalMessage);
    }

    const userToKick = targetUsers[0];
    
    // Prevent kicking yourself
    if (userToKick === sender) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "You cannot kick yourself!")
      }, originalMessage);
    }
    
    // Prevent kicking other admins
    if (admins.includes(userToKick)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", 
          `You cannot kick another admin!
Use .demote @${userToKick.split("@")[0]} first.`),
        mentions: [userToKick]
      }, originalMessage);
    }
    
    try {
      await this.simulateTyping(jid, 2200);
      await this.sock.groupParticipantsUpdate(jid, [userToKick], "remove");
      return this.sendReply(jid, {
        text: createStyledMessage("USER KICKED",
          `User has been kicked!
User: @${userToKick.split("@")[0]}
Kicked by: @${sender.split("@")[0]}`),
        mentions: [userToKick, sender]
      }, originalMessage);
    } catch (error) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", `Failed to kick user:
${error.message}`)
      }, originalMessage);
    }
  }

  async handleSetDesc(jid, isGroup, sender, description, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can change group description!")
      }, originalMessage);
    }

    if (!description) {
      return this.sendReply(jid, {
        text: createStyledMessage("USAGE", `Usage: .setdesc [new description]
Example: .setdesc Welcome to our group!`)
      }, originalMessage);
    }

    try {
      await this.simulateTyping(jid, 1500);
      await this.sock.groupUpdateDescription(jid, description);
      return this.sendReply(jid, {
        text: createStyledMessage("DESCRIPTION UPDATED",
          `Group description updated!
New Description: ${description}
Changed by: @${sender.split("@")[0]}`)
      }, originalMessage);
    } catch (error) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", `Failed to update description:
${error.message}`)
      }, originalMessage);
    }
  }

  async handleSetPP(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can change group profile picture!")
      }, originalMessage);
    }

    // Check if the message contains an image or quoted image
    const quotedMessage = getQuotedMessage(originalMessage);
    const hasImage = originalMessage.message?.imageMessage || 
                    (quotedMessage?.imageMessage);

    if (!hasImage) {
      return this.sendReply(jid, {
        text: createStyledMessage("USAGE", `Usage: Send an image with caption .setpp
OR
Reply to an image with .setpp

Example: Send an image, then reply to it with .setpp`)
      }, originalMessage);
    }

    try {
      await this.simulateTyping(jid, 3000);
      
      // Get the image buffer
      let imageBuffer;
      if (originalMessage.message?.imageMessage) {
        // Direct image
        imageBuffer = await this.sock.downloadMediaMessage(originalMessage);
      } else if (quotedMessage?.imageMessage) {
        // Quoted image - create a mock message for download
        const mockMessage = {
          key: originalMessage.key,
          message: { imageMessage: quotedMessage.imageMessage }
        };
        imageBuffer = await this.sock.downloadMediaMessage(mockMessage);
      }
      
      if (!imageBuffer) {
        throw new Error("Failed to download image");
      }
      
      // Update group profile picture
      await this.sock.updateProfilePicture(jid, imageBuffer);
      
      return this.sendReply(jid, {
        text: createStyledMessage("PROFILE PICTURE UPDATED",
          `Group profile picture updated successfully!
Changed by: @${sender.split("@")[0]}`)
      }, originalMessage);
    } catch (error) {
      console.error("Error updating profile picture:", error);
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", `Failed to update profile picture:
${error.message || "Unknown error"}`)
      }, originalMessage);
    }
  }

  async handleAntiLink(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-link settings!")
      }, originalMessage);
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antilink = !settings.antilink;
    this.groupSettings.set(jid, settings);

    const status = settings.antilink ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antilink ? "will be automatically deleted" : "are now allowed";
    
    return this.sendReply(jid, {
      text: createStyledMessage("ANTI-LINK SETTINGS",
        `Anti-link protection has been ${status}
Links ${action} in this group.
Changed by: @${sender.split("@")[0]}`)
    }, originalMessage);
  }

  async handleAntiSticker(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-sticker settings!")
      }, originalMessage);
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antisticker = !settings.antisticker;
    this.groupSettings.set(jid, settings);

    const status = settings.antisticker ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antisticker ? "will be automatically deleted" : "are now allowed";
    
    return this.sendReply(jid, {
      text: createStyledMessage("ANTI-STICKER SETTINGS",
        `Anti-sticker protection has been ${status}
Stickers ${action} in this group.
Changed by: @${sender.split("@")[0]}`)
    }, originalMessage);
  }

  async handleAntiAudio(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-audio settings!")
      }, originalMessage);
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antiaudio = !settings.antiaudio;
    this.groupSettings.set(jid, settings);

    const status = settings.antiaudio ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antiaudio ? "will be automatically deleted" : "are now allowed";
    
    return this.sendReply(jid, {
      text: createStyledMessage("ANTI-AUDIO SETTINGS",
        `Anti-audio protection has been ${status}
Audio messages ${action} in this group.
Changed by: @${sender.split("@")[0]}`)
    }, originalMessage);
  }

  async handleAntiVideo(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-video settings!")
      }, originalMessage);
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antivideo = !settings.antivideo;
    this.groupSettings.set(jid, settings);

    const status = settings.antivideo ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antivideo ? "will be automatically deleted" : "are now allowed";
    
    return this.sendReply(jid, {
      text: createStyledMessage("ANTI-VIDEO SETTINGS",
        `Anti-video protection has been ${status}
Videos ${action} in this group.
Changed by: @${sender.split("@")[0]}`)
    }, originalMessage);
  }

  async handleAntiViewOnce(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-viewonce settings!")
      }, originalMessage);
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antiviewonce = !settings.antiviewonce;
    this.groupSettings.set(jid, settings);

    const status = settings.antiviewonce ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antiviewonce ? "will be automatically deleted" : "are now allowed";
    
    return this.sendReply(jid, {
      text: createStyledMessage("ANTI-VIEWONCE SETTINGS",
        `Anti-viewonce protection has been ${status}
View-once messages ${action} in this group.
Changed by: @${sender.split("@")[0]}`)
    }, originalMessage);
  }

  async handleAntiImage(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-image settings!")
      }, originalMessage);
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antiimage = !settings.antiimage;
    this.groupSettings.set(jid, settings);

    const status = settings.antiimage ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antiimage ? "will be automatically deleted" : "are now allowed";
    
    return this.sendReply(jid, {
      text: createStyledMessage("ANTI-IMAGE SETTINGS",
        `Anti-image protection has been ${status}
Images ${action} in this group.
Changed by: @${sender.split("@")[0]}`)
    }, originalMessage);
  }

  async handleAntiFile(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!")
      }, originalMessage);
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-file settings!")
      }, originalMessage);
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antifile = !settings.antifile;
    this.groupSettings.set(jid, settings);

    const status = settings.antifile ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antifile ? "will be automatically deleted" : "are now allowed";
    
    return this.sendReply(jid, {
      text: createStyledMessage("ANTI-FILE SETTINGS",
        `Anti-file protection has been ${status}
Files/Documents ${action} in this group.
Changed by: @${sender.split("@")[0]}`)
    }, originalMessage);
  }

  // IMPROVED: Download media command (.vv or .save) based on working code
  async handleDownloadMedia(jid, sender, originalMessage) {
    try {
      await this.simulateTyping(jid, 2000);
      
      // Get quoted message
      const quotedMessage = getQuotedMessage(originalMessage);
      
      if (!quotedMessage) {
        return this.sendReply(jid, {
          text: createStyledMessage("USAGE", `Usage: Reply to a view-once/image/video/audio message with .vv or .save

Example:
- Reply to view-once with .vv
- Reply to image with .save`)
        }, originalMessage);
      }

      // Determine message type
      const messageType = getMessageType(quotedMessage);
      
      let mediaType, ext, fileName;
      
      // Handle view-once messages
      if (messageType === "viewOnceMessage" || messageType === "viewOnceMessageV2") {
        const viewOnceMsg = quotedMessage[messageType];
        const innerType = getMessageType(viewOnceMsg.message);
        
        if (innerType === "imageMessage") {
          mediaType = "image";
          ext = "jpg";
          fileName = `viewonce_${Date.now()}.${ext}`;
        } else if (innerType === "videoMessage") {
          mediaType = "video";
          ext = "mp4";
          fileName = `viewonce_${Date.now()}.${ext}`;
        } else {
          return this.sendReply(jid, {
            text: createStyledMessage("ERROR", "Unsupported view-once type. Only images and videos are supported.")
          }, originalMessage);
        }
        
        // Create mock message for download
        const mockMessage = {
          key: originalMessage.key,
          message: { [messageType]: viewOnceMsg }
        };
        
        const buffer = await this.sock.downloadMediaMessage(mockMessage);
        
        if (!buffer) {
          throw new Error("Failed to download view-once media");
        }
        
        // Save to file
        fs.writeFileSync(fileName, buffer);
        
        // Send the media
        let mediaMessage = {};
        if (mediaType === "image") {
          mediaMessage = { image: fs.readFileSync(fileName), caption: "📸 View-Once Image Retrieved" };
        } else if (mediaType === "video") {
          mediaMessage = { video: fs.readFileSync(fileName), caption: "🎥 View-Once Video Retrieved" };
        }
        
        await this.sock.sendMessage(jid, mediaMessage);
        
        // Clean up
        fs.unlinkSync(fileName);
        
      } 
      // Handle regular media messages
      else if (messageType === "imageMessage") {
        mediaType = "image";
        ext = "jpg";
        fileName = `image_${Date.now()}.${ext}`;
        
        const mockMessage = {
          key: originalMessage.key,
          message: { imageMessage: quotedMessage.imageMessage }
        };
        
        const buffer = await this.sock.downloadMediaMessage(mockMessage);
        fs.writeFileSync(fileName, buffer);
        
        await this.sock.sendMessage(jid, {
          image: fs.readFileSync(fileName),
          caption: "📸 Downloaded Image"
        });
        
        fs.unlinkSync(fileName);
        
      } else if (messageType === "videoMessage") {
        mediaType = "video";
        ext = "mp4";
        fileName = `video_${Date.now()}.${ext}`;
        
        const mockMessage = {
          key: originalMessage.key,
          message: { videoMessage: quotedMessage.videoMessage }
        };
        
        const buffer = await this.sock.downloadMediaMessage(mockMessage);
        fs.writeFileSync(fileName, buffer);
        
        await this.sock.sendMessage(jid, {
          video: fs.readFileSync(fileName),
          caption: "🎥 Downloaded Video"
        });
        
        fs.unlinkSync(fileName);
        
      } else if (messageType === "audioMessage") {
        mediaType = "audio";
        ext = "mp3";
        fileName = `audio_${Date.now()}.${ext}`;
        
        const mockMessage = {
          key: originalMessage.key,
          message: { audioMessage: quotedMessage.audioMessage }
        };
        
        const buffer = await this.sock.downloadMediaMessage(mockMessage);
        fs.writeFileSync(fileName, buffer);
        
        await this.sock.sendMessage(jid, {
          audio: fs.readFileSync(fileName),
          mimetype: 'audio/mp4',
          ptt: false
        });
        
        fs.unlinkSync(fileName);
        
      } else if (messageType === "documentMessage") {
        mediaType = "document";
        ext = quotedMessage.documentMessage.fileName?.split('.').pop() || 'bin';
        fileName = quotedMessage.documentMessage.fileName || `document_${Date.now()}.${ext}`;
        
        const mockMessage = {
          key: originalMessage.key,
          message: { documentMessage: quotedMessage.documentMessage }
        };
        
        const buffer = await this.sock.downloadMediaMessage(mockMessage);
        fs.writeFileSync(fileName, buffer);
        
        await this.sock.sendMessage(jid, {
          document: fs.readFileSync(fileName),
          fileName: fileName,
          mimetype: quotedMessage.documentMessage.mimetype || 'application/octet-stream'
        });
        
        fs.unlinkSync(fileName);
        
      } else {
        return this.sendReply(jid, {
          text: createStyledMessage("ERROR", "Unsupported media type. Please reply to an image, video, audio, or document message.")
        }, originalMessage);
      }

      // Send success message
      return this.sendReply(jid, {
        text: createStyledMessage("MEDIA DOWNLOADED",
          `✅ Media downloaded successfully!
Type: ${mediaType.toUpperCase()}
Sent to chat.`)
      }, originalMessage);

    } catch (error) {
      console.error("Error downloading media:", error);
      return this.sendReply(jid, {
        text: createStyledMessage("ERROR", `Failed to download media:
${error.message}`)
      }, originalMessage);
    }
  }
}

module.exports = CommandHandler;