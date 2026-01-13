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
  getAbout
} = require('./utils');

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
        return this.sock.sendMessage(jid, {
          text: `📢 *${CHANNEL_NAME}*\n\nFollow our WhatsApp Channel:\n${CHANNEL_LINK}`,
          contextInfo: getNewsletterContext()
        });
      }
    }

    // Extract text from message
    const type = Object.keys(m.message)[0];
    let text = "";
    let quotedMessage = null;
    let quotedParticipant = null;
    
    if (type === "conversation") {
      text = m.message.conversation;
    } else if (type === "extendedTextMessage") {
      text = m.message.extendedTextMessage.text;
      quotedMessage = m.message.extendedTextMessage.contextInfo?.quotedMessage;
      quotedParticipant = m.message.extendedTextMessage.contextInfo?.participant;
    } else if (type === "imageMessage" && m.message.imageMessage.caption) {
      text = m.message.imageMessage.caption;
    } else if (type === "videoMessage" && m.message.videoMessage.caption) {
      text = m.message.videoMessage.caption;
    }

    // Check for anti-features BEFORE processing commands
    if (isGroup) {
      await this.checkAntiFeatures(jid, m);
    }

    if (!text || !text.startsWith(".")) return;

    // Prevent reply loops
    const isBotEcho = m.key.fromMe && 
      m.message.extendedTextMessage?.contextInfo?.stanzaId;
    if (isBotEcho) return;

    const args = text.slice(1).trim().split(/\s+/);
    const command = args[0].toLowerCase();
    
    // Get target users - prefer quoted message, then mentioned users
    let targetUsers = [];
    
    if (quotedParticipant) {
      // Use quoted participant
      targetUsers = [quotedParticipant];
    } else {
      // Get mentioned users
      targetUsers = m.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    }

    this.stats.commandsExecuted++;

    // Simulate typing before response
    const typingDuration = Math.random() * 1500 + 800;
    await this.simulateTyping(jid, typingDuration);

    // Add small random delay for human-like behavior
    const randomDelay = Math.random() * 1000 + 500;
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    // Route command to appropriate handler
    switch(command) {
      case 'alive':
        return this.handleAlive(jid, m);
      case 'ping':
        return this.handlePing(jid, m);
      case 'menu':
        return this.handleMenu(jid, m);
      case 'tagall':
        return this.handleTagAll(jid, isGroup, sender, m);
      case 'mute':
        return this.handleMute(jid, isGroup, sender, true, m);
      case 'unmute':
        return this.handleMute(jid, isGroup, sender, false, m);
      case 'help':
        return this.handleHelp(jid, m);
      case 'info':
        return this.handleInfo(jid, m);
      case 'stats':
        return this.handleStats(jid, m);
      case 'about':
        return this.handleAbout(jid, m);
      case 'welcome':
        return this.handleWelcome(jid, isGroup, sender, m);
      case 'promote':
        return this.handlePromote(jid, isGroup, sender, targetUsers, m, quotedMessage);
      case 'demote':
        return this.handleDemote(jid, isGroup, sender, targetUsers, m, quotedMessage);
      case 'kick':
        return this.handleKick(jid, isGroup, sender, targetUsers, m, quotedMessage);
      case 'setdesc':
        return this.handleSetDesc(jid, isGroup, sender, args.slice(1).join(" "), m);
      case 'antilink':
        return this.handleAntiLink(jid, isGroup, sender, m);
      case 'antisticker':
        return this.handleAntiSticker(jid, isGroup, sender, m);
      case 'antiaudio':
        return this.handleAntiAudio(jid, isGroup, sender, m);
      case 'antivideo':
        return this.handleAntiVideo(jid, isGroup, sender, m);
      case 'antiviewonce':
        return this.handleAntiViewOnce(jid, isGroup, sender, m);
      case 'antiimage':
        return this.handleAntiImage(jid, isGroup, sender, m);
      case 'antifile':
        return this.handleAntiFile(jid, isGroup, sender, m);
      case 'setpp':
        return this.handleSetPP(jid, isGroup, sender, m);
      case 'vv':
      case 'save':
        return this.handleDownloadMedia(jid, sender, m);
      default:
        return this.handleUnknownCommand(jid, m);
    }
  }

  async handleUnknownCommand(jid, originalMessage) {
    await this.simulateTyping(jid, 1000);
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("UNKNOWN COMMAND", 
        `Command not recognized.
        
Type *.help* to see available commands.`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async checkAntiFeatures(jid, m) {
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    // Get message text
    const text = m.message.conversation || 
                 m.message.extendedTextMessage?.text || 
                 m.message.imageMessage?.caption || "";
    
    // Check for links (including shortened URLs)
    const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+|bit\.ly\/[^\s]+|t\.co\/[^\s]+|goo\.gl\/[^\s]+)/i.test(text);
    
    if (settings.antilink && hasLink && !m.key.fromMe) {
      try {
        // Send warning and delete message
        await this.sock.sendMessage(jid, {
          text: createStyledMessage("ANTI-LINK", 
            `⚠️ Links are not allowed in this group!
Message from @${m.key.participant?.split('@')[0] || 'User'} deleted.`),
          mentions: m.key.participant ? [m.key.participant] : [],
          contextInfo: getNewsletterContext()
        });
        
        // Delete the message containing link
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting link message:", error);
      }
    }

    // Check for stickers
    if (settings.antisticker && m.message.stickerMessage && !m.key.fromMe) {
      try {
        await this.sock.sendMessage(jid, {
          text: createStyledMessage("ANTI-STICKER", 
            `⚠️ Stickers are not allowed in this group!
Sticker from @${m.key.participant?.split('@')[0] || 'User'} deleted.`),
          mentions: m.key.participant ? [m.key.participant] : [],
          contextInfo: getNewsletterContext()
        });
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting sticker:", error);
      }
    }

    // Check for audio
    if (settings.antiaudio && m.message.audioMessage && !m.key.fromMe) {
      try {
        await this.sock.sendMessage(jid, {
          text: createStyledMessage("ANTI-AUDIO", 
            `⚠️ Audio messages are not allowed in this group!
Audio from @${m.key.participant?.split('@')[0] || 'User'} deleted.`),
          mentions: m.key.participant ? [m.key.participant] : [],
          contextInfo: getNewsletterContext()
        });
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting audio:", error);
      }
    }

    // Check for video
    if (settings.antivideo && m.message.videoMessage && !m.key.fromMe) {
      try {
        await this.sock.sendMessage(jid, {
          text: createStyledMessage("ANTI-VIDEO", 
            `⚠️ Videos are not allowed in this group!
Video from @${m.key.participant?.split('@')[0] || 'User'} deleted.`),
          mentions: m.key.participant ? [m.key.participant] : [],
          contextInfo: getNewsletterContext()
        });
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting video:", error);
      }
    }

    // Check for view once
    if (settings.antiviewonce && (m.message.viewOnceMessage || m.message.viewOnceMessageV2) && !m.key.fromMe) {
      try {
        await this.sock.sendMessage(jid, {
          text: createStyledMessage("ANTI-VIEWONCE", 
            `⚠️ View-once messages are not allowed in this group!
Message from @${m.key.participant?.split('@')[0] || 'User'} deleted.`),
          mentions: m.key.participant ? [m.key.participant] : [],
          contextInfo: getNewsletterContext()
        });
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting view-once message:", error);
      }
    }

    // Check for image
    if (settings.antiimage && m.message.imageMessage && !m.key.fromMe) {
      try {
        await this.sock.sendMessage(jid, {
          text: createStyledMessage("ANTI-IMAGE", 
            `⚠️ Images are not allowed in this group!
Image from @${m.key.participant?.split('@')[0] || 'User'} deleted.`),
          mentions: m.key.participant ? [m.key.participant] : [],
          contextInfo: getNewsletterContext()
        });
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting image:", error);
      }
    }

    // Check for document/file
    if (settings.antifile && m.message.documentMessage && !m.key.fromMe) {
      try {
        await this.sock.sendMessage(jid, {
          text: createStyledMessage("ANTI-FILE", 
            `⚠️ Files/Documents are not allowed in this group!
File from @${m.key.participant?.split('@')[0] || 'User'} deleted.`),
          mentions: m.key.participant ? [m.key.participant] : [],
          contextInfo: getNewsletterContext()
        });
        
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
      
      return await this.sock.sendMessage(jid, {
        image: { url: botImage.url },
        caption: createStyledMessage("SYSTEM STATUS", 
          `Viral-Bot Mini is Alive & Running
Status: ONLINE
Uptime: 100%
Version: 2.2.0
Commands: 25+ Active`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error sending alive message:", error);
      // Fallback to text if image fails
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("SYSTEM STATUS", 
          `Viral-Bot Mini is Alive & Running ✅
Status: ONLINE
Uptime: 100%
Version: 2.2.0
Commands: 25+ Active`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleMenu(jid, originalMessage) {
    try {
      // Simulate longer thinking time for menu
      await this.simulateTyping(jid, 2000);
      
      const botImage = getBotImage();
      
      return await this.sock.sendMessage(jid, {
        image: { url: botImage.url },
        caption: getCommandList(),
        buttons: [{
          buttonId: "open_channel",
          buttonText: { displayText: "📢 View Channel" },
          type: 1
        }],
        headerType: 1,
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error sending menu:", error);
      // Fallback to text if image fails
      return this.sock.sendMessage(jid, {
        text: getCommandList(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handlePing(jid, originalMessage) {
    const start = Date.now();
    
    // Simulate typing
    await this.simulateTyping(jid, 1200);
    
    const latency = Date.now() - start;
    
    // Simulate more typing
    await this.simulateTyping(jid, 800);
    
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("PING TEST", 
        `PONG! 🏓
Latency: ${latency}ms
Status: Optimal
Server: Active`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleHelp(jid, originalMessage) {
    await this.simulateTyping(jid, 1500);
    return this.sock.sendMessage(jid, {
      text: getCommandList(),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleInfo(jid, originalMessage) {
    await this.simulateTyping(jid, 1200);
    return this.sock.sendMessage(jid, {
      text: getBotInfo(),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleStats(jid, originalMessage) {
    await this.simulateTyping(jid, 2200);
    const groups = await this.sock.groupFetchAllParticipating();
    const groupCount = Object.keys(groups).length;
    
    return this.sock.sendMessage(jid, {
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
${new Date().toLocaleString()}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleAbout(jid, originalMessage) {
    await this.simulateTyping(jid, 1800);
    return this.sock.sendMessage(jid, {
      text: getAbout(),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleTagAll(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    await this.simulateTyping(jid, 3000);
    const meta = await this.sock.groupMetadata(jid);
    const mentions = meta.participants.map(p => p.id);
    const mentionList = mentions.map(u => `@${u.split("@")[0]}`).join("\n│➽ ");

    return this.sock.sendMessage(jid, {
      text: createStyledMessage("GROUP ACTION",
        `TAG ALL MEMBERS
Total: ${mentions.length} members

${mentionList}`),
      mentions,
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleMute(jid, isGroup, sender, shouldMute, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can use this command!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    await this.simulateTyping(jid, 1500);
    await this.sock.groupSettingUpdate(
      jid,
      shouldMute ? "announcement" : "not_announcement"
    );

    const action = shouldMute ? "GROUP MUTED" : "GROUP UNMUTED";
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("ADMIN ACTION",
        `${action}
Group: ${meta.subject}
Action by: @${sender.split("@")[0]}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleWelcome(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.welcome = !settings.welcome;
    this.groupSettings.set(jid, settings);

    const status = settings.welcome ? "ENABLED ✅" : "DISABLED ❌";
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("WELCOME SETTINGS",
        `Welcome messages have been ${status}
Group: ${jid.split("@")[0]}
Changed by: @${sender.split("@")[0]}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handlePromote(jid, isGroup, sender, targetUsers, originalMessage, quotedMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can promote users!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    if (targetUsers.length === 0) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("USAGE", 
          `Usage: .promote @user
OR
Reply to a message with .promote

Example:
- .promote @username
- Reply to user's message with .promote`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const userToPromote = targetUsers[0];
    
    // Check if user is already admin
    const isAlreadyAdmin = admins.includes(userToPromote);
    if (isAlreadyAdmin) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("INFO", 
          `User is already an admin!
User: @${userToPromote.split("@")[0]}`),
        mentions: [userToPromote],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
    
    try {
      await this.simulateTyping(jid, 1800);
      await this.sock.groupParticipantsUpdate(jid, [userToPromote], "promote");
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("PROMOTION SUCCESS",
          `User promoted to admin!
User: @${userToPromote.split("@")[0]}
Promoted by: @${sender.split("@")[0]}`),
        mentions: [userToPromote, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `Failed to promote user:
${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleDemote(jid, isGroup, sender, targetUsers, originalMessage, quotedMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can demote users!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    if (targetUsers.length === 0) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("USAGE", 
          `Usage: .demote @user
OR
Reply to a message with .demote

Example:
- .demote @username
- Reply to user's message with .demote`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const userToDemote = targetUsers[0];
    
    // Check if user is not an admin
    const isAdmin = admins.includes(userToDemote);
    if (!isAdmin) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("INFO", 
          `User is not an admin!
User: @${userToDemote.split("@")[0]}`),
        mentions: [userToDemote],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
    
    // Prevent demoting yourself if you're the only admin
    if (userToDemote === sender && admins.length === 1) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", 
          `You cannot demote yourself as the only admin!
Promote someone else first.`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
    
    try {
      await this.simulateTyping(jid, 1800);
      await this.sock.groupParticipantsUpdate(jid, [userToDemote], "demote");
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("DEMOTION SUCCESS",
          `User demoted from admin!
User: @${userToDemote.split("@")[0]}
Demoted by: @${sender.split("@")[0]}`),
        mentions: [userToDemote, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `Failed to demote user:
${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleKick(jid, isGroup, sender, targetUsers, originalMessage, quotedMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can kick users!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    if (targetUsers.length === 0) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("USAGE", 
          `Usage: .kick @user
OR
Reply to a message with .kick

Example:
- .kick @username
- Reply to user's message with .kick`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const userToKick = targetUsers[0];
    
    // Prevent kicking yourself
    if (userToKick === sender) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "You cannot kick yourself!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
    
    // Prevent kicking other admins
    if (admins.includes(userToKick)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", 
          `You cannot kick another admin!
Use .demote @${userToKick.split("@")[0]} first.`),
        mentions: [userToKick],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
    
    try {
      await this.simulateTyping(jid, 2200);
      await this.sock.groupParticipantsUpdate(jid, [userToKick], "remove");
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("USER KICKED",
          `User has been kicked!
User: @${userToKick.split("@")[0]}
Kicked by: @${sender.split("@")[0]}`),
        mentions: [userToKick, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `Failed to kick user:
${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleSetDesc(jid, isGroup, sender, description, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can change group description!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    if (!description) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("USAGE", `Usage: .setdesc [new description]
Example: .setdesc Welcome to our group!`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      await this.simulateTyping(jid, 1500);
      await this.sock.groupUpdateDescription(jid, description);
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("DESCRIPTION UPDATED",
          `Group description updated!
New Description: ${description}
Changed by: @${sender.split("@")[0]}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `Failed to update description:
${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleSetPP(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can change group profile picture!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    // Check if the message contains an image
    const hasImage = originalMessage.message?.imageMessage || 
                    (originalMessage.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage);

    if (!hasImage) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("USAGE", `Usage: Send an image with caption .setpp
OR
Reply to an image with .setpp

Example: Send an image, then reply to it with .setpp`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      await this.simulateTyping(jid, 3000);
      
      // Get the image buffer
      let imageBuffer;
      if (originalMessage.message?.imageMessage) {
        // Direct image
        imageBuffer = await this.sock.downloadMediaMessage(originalMessage);
      } else if (originalMessage.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
        // Quoted image
        imageBuffer = await this.sock.downloadMediaMessage({
          key: originalMessage.key,
          message: originalMessage.message.extendedTextMessage.contextInfo.quotedMessage
        });
      }
      
      if (!imageBuffer) {
        throw new Error("Failed to download image");
      }
      
      // Update group profile picture
      await this.sock.updateProfilePicture(jid, imageBuffer);
      
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("PROFILE PICTURE UPDATED",
          `Group profile picture updated successfully!
Changed by: @${sender.split("@")[0]}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error updating profile picture:", error);
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `Failed to update profile picture:
${error.message || "Unknown error"}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleAntiLink(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-link settings!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antilink = !settings.antilink;
    this.groupSettings.set(jid, settings);

    const status = settings.antilink ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antilink ? "will be automatically deleted" : "are now allowed";
    
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("ANTI-LINK SETTINGS",
        `Anti-link protection has been ${status}
Links ${action} in this group.
Changed by: @${sender.split("@")[0]}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleAntiSticker(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-sticker settings!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antisticker = !settings.antisticker;
    this.groupSettings.set(jid, settings);

    const status = settings.antisticker ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antisticker ? "will be automatically deleted" : "are now allowed";
    
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("ANTI-STICKER SETTINGS",
        `Anti-sticker protection has been ${status}
Stickers ${action} in this group.
Changed by: @${sender.split("@")[0]}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleAntiAudio(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-audio settings!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antiaudio = !settings.antiaudio;
    this.groupSettings.set(jid, settings);

    const status = settings.antiaudio ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antiaudio ? "will be automatically deleted" : "are now allowed";
    
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("ANTI-AUDIO SETTINGS",
        `Anti-audio protection has been ${status}
Audio messages ${action} in this group.
Changed by: @${sender.split("@")[0]}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleAntiVideo(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-video settings!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antivideo = !settings.antivideo;
    this.groupSettings.set(jid, settings);

    const status = settings.antivideo ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antivideo ? "will be automatically deleted" : "are now allowed";
    
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("ANTI-VIDEO SETTINGS",
        `Anti-video protection has been ${status}
Videos ${action} in this group.
Changed by: @${sender.split("@")[0]}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleAntiViewOnce(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-viewonce settings!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antiviewonce = !settings.antiviewonce;
    this.groupSettings.set(jid, settings);

    const status = settings.antiviewonce ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antiviewonce ? "will be automatically deleted" : "are now allowed";
    
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("ANTI-VIEWONCE SETTINGS",
        `Anti-viewonce protection has been ${status}
View-once messages ${action} in this group.
Changed by: @${sender.split("@")[0]}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleAntiImage(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-image settings!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antiimage = !settings.antiimage;
    this.groupSettings.set(jid, settings);

    const status = settings.antiimage ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antiimage ? "will be automatically deleted" : "are now allowed";
    
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("ANTI-IMAGE SETTINGS",
        `Anti-image protection has been ${status}
Images ${action} in this group.
Changed by: @${sender.split("@")[0]}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleAntiFile(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    const meta = await this.sock.groupMetadata(jid);
    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id);

    if (!admins.includes(sender)) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "Only admins can change anti-file settings!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    await this.simulateTyping(jid, 1200);
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    settings.antifile = !settings.antifile;
    this.groupSettings.set(jid, settings);

    const status = settings.antifile ? "ENABLED ✅" : "DISABLED ❌";
    const action = settings.antifile ? "will be automatically deleted" : "are now allowed";
    
    return this.sock.sendMessage(jid, {
      text: createStyledMessage("ANTI-FILE SETTINGS",
        `Anti-file protection has been ${status}
Files/Documents ${action} in this group.
Changed by: @${sender.split("@")[0]}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  // NEW: Download media command (.vv or .save)
  async handleDownloadMedia(jid, sender, originalMessage) {
    try {
      await this.simulateTyping(jid, 2000);
      
      // Check if there's a quoted message
      const quotedMessage = originalMessage.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      
      if (!quotedMessage) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("USAGE", `Usage: Reply to a view-once/image/video/audio message with .vv or .save

Example:
- Reply to view-once with .vv
- Reply to image with .save`),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      // Check message type
      let mediaType = "";
      let mediaBuffer = null;
      
      // Handle view-once messages
      if (quotedMessage.viewOnceMessage || quotedMessage.viewOnceMessageV2) {
        const viewOnceMsg = quotedMessage.viewOnceMessage || quotedMessage.viewOnceMessageV2;
        const messageType = Object.keys(viewOnceMsg.message)[0];
        
        if (messageType === "imageMessage") {
          mediaType = "image";
          mediaBuffer = await this.sock.downloadMediaMessage({
            key: originalMessage.key,
            message: { viewOnceMessage: { message: viewOnceMsg.message } }
          });
        } else if (messageType === "videoMessage") {
          mediaType = "video";
          mediaBuffer = await this.sock.downloadMediaMessage({
            key: originalMessage.key,
            message: { viewOnceMessage: { message: viewOnceMsg.message } }
          });
        }
      }
      // Handle regular media
      else if (quotedMessage.imageMessage) {
        mediaType = "image";
        mediaBuffer = await this.sock.downloadMediaMessage({
          key: originalMessage.key,
          message: { imageMessage: quotedMessage.imageMessage }
        });
      } else if (quotedMessage.videoMessage) {
        mediaType = "video";
        mediaBuffer = await this.sock.downloadMediaMessage({
          key: originalMessage.key,
          message: { videoMessage: quotedMessage.videoMessage }
        });
      } else if (quotedMessage.audioMessage) {
        mediaType = "audio";
        mediaBuffer = await this.sock.downloadMediaMessage({
          key: originalMessage.key,
          message: { audioMessage: quotedMessage.audioMessage }
        });
      } else if (quotedMessage.documentMessage) {
        mediaType = "document";
        mediaBuffer = await this.sock.downloadMediaMessage({
          key: originalMessage.key,
          message: { documentMessage: quotedMessage.documentMessage }
        });
      }

      if (!mediaBuffer || !mediaType) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "No downloadable media found in the quoted message!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      // Send the downloaded media back to user
      let mediaMessage = {};
      
      switch(mediaType) {
        case "image":
          mediaMessage = { image: mediaBuffer, caption: "📸 Downloaded Image" };
          break;
        case "video":
          mediaMessage = { video: mediaBuffer, caption: "🎥 Downloaded Video" };
          break;
        case "audio":
          mediaMessage = { audio: mediaBuffer, mimetype: 'audio/mp4' };
          break;
        case "document":
          mediaMessage = { 
            document: mediaBuffer, 
            mimetype: quotedMessage.documentMessage.mimetype || 'application/octet-stream',
            fileName: quotedMessage.documentMessage.fileName || 'downloaded_file'
          };
          break;
      }

      await this.sock.sendMessage(jid, mediaMessage);
      
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("MEDIA DOWNLOADED",
          `✅ Media downloaded successfully!
Type: ${mediaType.toUpperCase()}
Sent to your chat.`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });

    } catch (error) {
      console.error("Error downloading media:", error);
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `Failed to download media:
${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }
}

module.exports = CommandHandler;
