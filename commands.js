// commands.js
const { 
  BOT_IMAGE_URL, 
  CHANNEL_NAME, 
  CHANNEL_LINK, 
  NEWSLETTER_JID,
  getNewsletterContext,
  createStyledMessage, 
  getCommandList,
  getBotInfo,
  getAbout,
  getAliveMessage,
  getMenuMessage
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
    
    console.log("✅ CommandHandler initialized with socket");
  }

  async handleMessage(m) {
    try {
      const jid = m.key.remoteJid;
      if (jid === "status@broadcast" || m.key.fromMe) return;

      this.stats.messagesProcessed++;

      const isGroup = jid.endsWith("@g.us");
      const sender = isGroup ? m.key.participant || jid : jid;

      // Initialize group settings
      if (isGroup && !this.groupSettings.has(jid)) {
        this.groupSettings.set(jid, {
          welcome: true,
          antilink: false,
          antisticker: false,
          antiaudio: false
        });
      }

      // Button click handler
      if (m.message.buttonsResponseMessage) {
        const btn = m.message.buttonsResponseMessage.selectedButtonId;
        if (btn === "open_channel") {
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
      
      if (type === "conversation") {
        text = m.message.conversation;
      } else if (type === "extendedTextMessage") {
        text = m.message.extendedTextMessage.text;
        quotedMessage = m.message.extendedTextMessage.contextInfo?.quotedMessage;
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

      const args = text.slice(1).trim().split(/\s+/);
      const command = args[0].toLowerCase();
      
      // Get mentioned users OR get user from quoted message
      let targetUsers = [];
      
      if (quotedMessage) {
        // Get user from quoted message
        const quotedParticipant = m.message.extendedTextMessage.contextInfo?.participant;
        if (quotedParticipant) {
          targetUsers = [quotedParticipant];
        }
      } else {
        // Get mentioned users
        targetUsers = m.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
      }

      this.stats.commandsExecuted++;
      console.log(`📝 Command received: ${command} from ${sender}`);

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
          return this.handlePromote(jid, isGroup, sender, targetUsers, m);
        case 'demote':
          return this.handleDemote(jid, isGroup, sender, targetUsers, m);
        case 'kick':
          return this.handleKick(jid, isGroup, sender, targetUsers, m);
        case 'setdesc':
          return this.handleSetDesc(jid, isGroup, sender, args.slice(1).join(" "), m);
        case 'antilink':
          return this.handleAntiLink(jid, isGroup, sender, m);
        case 'antisticker':
          return this.handleAntiSticker(jid, isGroup, sender, m);
        case 'antiaudio':
          return this.handleAntiAudio(jid, isGroup, sender, m);
        case 'setpp':
          return this.handleSetPP(jid, isGroup, sender, m);
        default:
          // Unknown command - send help
          return this.sock.sendMessage(jid, {
            text: `❓ Unknown command: .${command}\n\nType .help or .menu to see available commands.`,
            contextInfo: getNewsletterContext()
          }, { quoted: m });
      }
    } catch (error) {
      console.error("❌ Error in handleMessage:", error);
      return null;
    }
  }

  async checkAntiFeatures(jid, m) {
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    // Get message text
    const text = m.message.conversation || 
                 m.message.extendedTextMessage?.text || 
                 m.message.imageMessage?.caption || "";
    
    // Check for links
    const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+)/.test(text);
    
    if (settings.antilink && hasLink && !m.key.fromMe) {
      try {
        // Send warning and delete message
        await this.sock.sendMessage(jid, {
          text: `⚠️ *Anti-Link Active*\nLinks are not allowed in this group!\nMessage from @${m.key.participant?.split('@')[0] || 'User'} deleted.`,
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
          text: `⚠️ *Anti-Sticker Active*\nStickers are not allowed in this group!\nSticker from @${m.key.participant?.split('@')[0] || 'User'} deleted.`,
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
          text: `⚠️ *Anti-Audio Active*\nAudio messages are not allowed in this group!\nAudio from @${m.key.participant?.split('@')[0] || 'User'} deleted.`,
          mentions: m.key.participant ? [m.key.participant] : [],
          contextInfo: getNewsletterContext()
        });
        
        await this.sock.sendMessage(jid, { delete: m.key });
      } catch (error) {
        console.error("Error deleting audio:", error);
      }
    }
  }

  async handleAlive(jid, originalMessage) {
    try {
      console.log("🟢 Handling .alive command");
      
      // Create the alive message
      const aliveText = `✅ *Viral-Bot Mini is Alive & Running*\n\n` +
                       `📊 *System Status*\n` +
                       `├─ Status: ONLINE\n` +
                       `├─ Uptime: 100%\n` +
                       `├─ Version: 2.0.0\n` +
                       `├─ Commands: 20+ Active\n` +
                       `└─ Response: < 1 second\n\n` +
                       `⚡ *Performance Metrics*\n` +
                       `├─ Memory: Optimized\n` +
                       `├─ Speed: High\n` +
                       `├─ Reliability: 99.9%\n` +
                       `└─ Updates: Automatic\n\n` +
                       `📢 Stay updated: ${CHANNEL_LINK}`;
      
      // Try to send image with caption
      try {
        const message = await this.sock.sendMessage(jid, {
          image: { url: BOT_IMAGE_URL },
          caption: aliveText,
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
        
        console.log("✅ .alive command executed successfully with image");
        return message;
      } catch (imageError) {
        console.log("Image failed, using text only:", imageError.message);
        // Fallback to text only
        return this.sock.sendMessage(jid, {
          text: aliveText,
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
    } catch (error) {
      console.error("❌ Error in handleAlive:", error.message);
      
      // Ultimate fallback
      return this.sock.sendMessage(jid, {
        text: "✅ Viral-Bot Mini is Alive!\n\nStatus: ONLINE\nType .menu for commands.",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handlePing(jid, originalMessage) {
    try {
      const start = Date.now();
      const pingMsg = await this.sock.sendMessage(jid, {
        text: "🏓 Pinging...",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      
      const latency = Date.now() - start;
      
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("PING TEST", 
          `🏓 PONG!\nLatency: ${latency}ms\nStatus: Optimal\nServer: Active`),
        contextInfo: getNewsletterContext()
      }, { quoted: pingMsg });
    } catch (error) {
      console.error("Error in handlePing:", error);
      return null;
    }
  }

  async handleMenu(jid, originalMessage) {
    try {
      console.log("📋 Handling .menu command");
      
      // Create menu text
      const menuText = `🤖 *Viral-Bot Mini Command Menu*\n\n` +
                      `Use any command by typing a dot (.) before it\n` +
                      `Example: .help, .alive, .menu\n\n` +
                      `📋 *Available Commands:*\n` +
                      `• .help    - Show all commands\n` +
                      `• .alive   - Check bot status\n` +
                      `• .menu    - Show this menu\n` +
                      `• .ping    - Test bot speed\n` +
                      `• .info    - Bot information\n` +
                      `• .stats   - Usage statistics\n` +
                      `• .about   - About developer\n\n` +
                      `👑 *Group Commands (Admin only):*\n` +
                      `• .promote @user - Make admin\n` +
                      `• .demote @user  - Remove admin\n` +
                      `• .kick @user    - Remove member\n` +
                      `• .tagall        - Mention everyone\n` +
                      `• .mute/.unmute  - Group settings\n\n` +
                      `🔧 *Group Settings (Admin only):*\n` +
                      `• .antilink    - Block links\n` +
                      `• .antisticker - Block stickers\n` +
                      `• .antiaudio   - Block audio\n` +
                      `• .setdesc     - Change description\n` +
                      `• .setpp       - Change group photo\n\n` +
                      `📢 *Stay Updated:*\n` +
                      `${CHANNEL_LINK}\n\n` +
                      `Type .help for detailed command list!`;
      
      // Try to send image with caption
      try {
        const message = await this.sock.sendMessage(jid, {
          image: { url: BOT_IMAGE_URL },
          caption: menuText,
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
        
        console.log("✅ .menu command executed successfully with image");
        return message;
      } catch (imageError) {
        console.log("Image failed, using text only:", imageError.message);
        // Fallback to text only
        return this.sock.sendMessage(jid, {
          text: menuText,
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
    } catch (error) {
      console.error("❌ Error in handleMenu:", error.message);
      
      // Ultimate fallback
      return this.sock.sendMessage(jid, {
        text: getCommandList(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleHelp(jid, originalMessage) {
    try {
      return this.sock.sendMessage(jid, {
        text: getCommandList(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleHelp:", error);
      return null;
    }
  }

  async handleInfo(jid, originalMessage) {
    try {
      return this.sock.sendMessage(jid, {
        text: getBotInfo(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleInfo:", error);
      return null;
    }
  }

  async handleStats(jid, originalMessage) {
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      const groupCount = Object.keys(groups).length;
      
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("BOT STATISTICS",
          `📊 *Usage Statistics*
────────────────────
Commands Executed: ${this.stats.commandsExecuted}
Messages Processed: ${this.stats.messagesProcessed}
Active Groups: ${groupCount}
Uptime: 100%

⚡ *Performance*
────────────────────
Response Time: < 1s
Success Rate: 99.9%
Memory Usage: Optimized

🔄 *Last Updated*
────────────────────
${new Date().toLocaleString()}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleStats:", error);
      return null;
    }
  }

  async handleAbout(jid, originalMessage) {
    try {
      return this.sock.sendMessage(jid, {
        text: getAbout(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleAbout:", error);
      return null;
    }
  }

  async handleTagAll(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const mentions = meta.participants.map(p => p.id);
      const mentionList = mentions.map(u => `@${u.split("@")[0]}`).join(" ");

      return this.sock.sendMessage(jid, {
        text: createStyledMessage("GROUP ACTION",
          `📣 TAG ALL MEMBERS\n\nTotal: ${mentions.length} members\n\n${mentionList}`),
        mentions,
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleTagAll:", error);
      return this.sock.sendMessage(jid, {
        text: "❌ Failed to tag members. Make sure I'm admin in this group.",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleMute(jid, isGroup, sender, shouldMute, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only admins can use this command!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      await this.sock.groupSettingUpdate(
        jid,
        shouldMute ? "announcement" : "not_announcement"
      );

      const action = shouldMute ? "🔇 GROUP MUTED" : "🔊 GROUP UNMUTED";
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ADMIN ACTION",
          `${action}\nGroup: ${meta.subject}\nAction by: @${sender.split("@")[0]}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleMute:", error);
      return this.sock.sendMessage(jid, {
        text: "❌ Failed to change group settings. Make sure I'm admin.",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleWelcome(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const settings = this.groupSettings.get(jid);
      if (!settings) return;

      settings.welcome = !settings.welcome;
      this.groupSettings.set(jid, settings);

      const status = settings.welcome ? "ENABLED ✅" : "DISABLED ❌";
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("WELCOME SETTINGS",
          `Welcome messages have been ${status}\n\nGroup: ${jid.split("@")[0]}\nChanged by: @${sender.split("@")[0]}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleWelcome:", error);
      return null;
    }
  }

  async handlePromote(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only admins can promote users!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      if (targetUsers.length === 0) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("USAGE", 
            "Usage: .promote @user\nOR\nReply to a message with .promote\n\nExample:\n- .promote @username\n- Reply to user's message with .promote"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const userToPromote = targetUsers[0];
      
      // Check if user is already admin
      const isAlreadyAdmin = admins.includes(userToPromote);
      if (isAlreadyAdmin) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("INFO", 
            `👑 User is already an admin!\n\nUser: @${userToPromote.split("@")[0]}`),
          mentions: [userToPromote],
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
      
      await this.sock.groupParticipantsUpdate(jid, [userToPromote], "promote");
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("PROMOTION SUCCESS",
          `👑 User promoted to admin!\n\nUser: @${userToPromote.split("@")[0]}\nPromoted by: @${sender.split("@")[0]}`),
        mentions: [userToPromote, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handlePromote:", error);
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `❌ Failed to promote user:\n${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleDemote(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only admins can demote users!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      if (targetUsers.length === 0) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("USAGE", 
            "Usage: .demote @user\nOR\nReply to a message with .demote\n\nExample:\n- .demote @username\n- Reply to user's message with .demote"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const userToDemote = targetUsers[0];
      
      // Check if user is not an admin
      const isAdmin = admins.includes(userToDemote);
      if (!isAdmin) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("INFO", 
            `📉 User is not an admin!\n\nUser: @${userToDemote.split("@")[0]}`),
          mentions: [userToDemote],
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
      
      // Prevent demoting yourself if you're the only admin
      if (userToDemote === sender && admins.length === 1) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", 
            "❌ You cannot demote yourself as the only admin!\nPromote someone else first."),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
      
      await this.sock.groupParticipantsUpdate(jid, [userToDemote], "demote");
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("DEMOTION SUCCESS",
          `📉 User demoted from admin!\n\nUser: @${userToDemote.split("@")[0]}\nDemoted by: @${sender.split("@")[0]}`),
        mentions: [userToDemote, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleDemote:", error);
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `❌ Failed to demote user:\n${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleKick(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only admins can kick users!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      if (targetUsers.length === 0) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("USAGE", 
            "Usage: .kick @user\nOR\nReply to a message with .kick\n\nExample:\n- .kick @username\n- Reply to user's message with .kick"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const userToKick = targetUsers[0];
      
      // Prevent kicking yourself
      if (userToKick === sender) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ You cannot kick yourself!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
      
      // Prevent kicking other admins
      if (admins.includes(userToKick)) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", 
            `❌ You cannot kick another admin!\nUse .demote @${userToKick.split("@")[0]} first.`),
          mentions: [userToKick],
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
      
      await this.sock.groupParticipantsUpdate(jid, [userToKick], "remove");
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("USER KICKED",
          `👢 User has been kicked!\n\nUser: @${userToKick.split("@")[0]}\nKicked by: @${sender.split("@")[0]}`),
        mentions: [userToKick, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleKick:", error);
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `❌ Failed to kick user:\n${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleSetDesc(jid, isGroup, sender, description, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only admins can change group description!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      if (!description) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("USAGE", "Usage: .setdesc [new description]\nExample: .setdesc Welcome to our group!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      await this.sock.groupUpdateDescription(jid, description);
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("DESCRIPTION UPDATED",
          `📝 Group description updated!\n\nNew Description: ${description}\nChanged by: @${sender.split("@")[0]}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleSetDesc:", error);
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `❌ Failed to update description:\n${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleSetPP(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only admins can change group profile picture!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      // Check if the message contains an image
      if (!originalMessage.message?.imageMessage) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("USAGE", "Usage: Reply to an image with .setpp\n\nExample: Send an image, then reply to it with .setpp"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      // Get the image buffer
      const imageBuffer = await this.sock.downloadMediaMessage(originalMessage);
      
      // Update group profile picture
      await this.sock.updateProfilePicture(jid, imageBuffer);
      
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("PROFILE PICTURE UPDATED",
          `🖼️ Group profile picture updated!\n\nChanged by: @${sender.split("@")[0]}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleSetPP:", error);
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `❌ Failed to update profile picture:\n${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleAntiLink(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only admins can change anti-link settings!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const settings = this.groupSettings.get(jid);
      if (!settings) return;

      settings.antilink = !settings.antilink;
      this.groupSettings.set(jid, settings);

      const status = settings.antilink ? "ENABLED ✅" : "DISABLED ❌";
      const action = settings.antilink ? "will be automatically deleted" : "are now allowed";
      
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ANTI-LINK SETTINGS",
          `🔗 Anti-link protection has been ${status}\n\nLinks ${action} in this group.\nChanged by: @${sender.split("@")[0]}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleAntiLink:", error);
      return null;
    }
  }

  async handleAntiSticker(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only admins can change anti-sticker settings!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const settings = this.groupSettings.get(jid);
      if (!settings) return;

      settings.antisticker = !settings.antisticker;
      this.groupSettings.set(jid, settings);

      const status = settings.antisticker ? "ENABLED ✅" : "DISABLED ❌";
      const action = settings.antisticker ? "will be automatically deleted" : "are now allowed";
      
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ANTI-STICKER SETTINGS",
          `😀 Anti-sticker protection has been ${status}\n\nStickers ${action} in this group.\nChanged by: @${sender.split("@")[0]}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleAntiSticker:", error);
      return null;
    }
  }

  async handleAntiAudio(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in groups!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only admins can change anti-audio settings!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const settings = this.groupSettings.get(jid);
      if (!settings) return;

      settings.antiaudio = !settings.antiaudio;
      this.groupSettings.set(jid, settings);

      const status = settings.antiaudio ? "ENABLED ✅" : "DISABLED ❌";
      const action = settings.antiaudio ? "will be automatically deleted" : "are now allowed";
      
      return this.sock.sendMessage(jid, {
        text: createStyledMessage("ANTI-AUDIO SETTINGS",
          `🎵 Anti-audio protection has been ${status}\n\nAudio messages ${action} in this group.\nChanged by: @${sender.split("@")[0]}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Error in handleAntiAudio:", error);
      return null;
    }
  }
}

module.exports = CommandHandler;