// commands.js
const { 
  BOT_IMAGE_URL, 
  FALLBACK_IMAGE_URL,
  CHANNEL_NAME, 
  CHANNEL_LINK, 
  NEWSLETTER_JID,
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
      groupsActive: 0,
      startTime: Date.now(),
      errors: 0
    };
    this.groupSettings = new Map();
    this.commandCooldown = new Map();
    
    console.log("✅ Command Handler Initialized");
  }

  getUptime() {
    const uptime = Date.now() - this.stats.startTime;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  async handleMessage(m) {
    try {
      const jid = m.key.remoteJid;
      if (!jid || jid === "status@broadcast") return;

      this.stats.messagesProcessed++;

      const isGroup = jid.endsWith("@g.us");
      const sender = isGroup ? (m.key.participant || jid) : jid;

      // Initialize group settings
      if (isGroup && !this.groupSettings.has(jid)) {
        this.groupSettings.set(jid, {
          welcome: true,
          antilink: false,
          antisticker: false,
          antiaudio: false,
          lastTagAll: 0
        });
      }

      // Button click handler
      if (m.message?.buttonsResponseMessage) {
        const btn = m.message.buttonsResponseMessage.selectedButtonId;
        if (btn === "open_channel") {
          await this.sock.sendMessage(jid, {
            text: `📢 *${CHANNEL_NAME}*\n\nFollow our WhatsApp Channel for updates:\n${CHANNEL_LINK}`,
            contextInfo: getNewsletterContext()
          });
          return;
        }
      }

      // Extract text from message
      const message = m.message;
      let text = "";
      let quotedMessage = null;
      
      if (message.conversation) {
        text = message.conversation;
      } else if (message.extendedTextMessage) {
        text = message.extendedTextMessage.text || "";
        quotedMessage = message.extendedTextMessage.contextInfo?.quotedMessage;
      } else if (message.imageMessage && message.imageMessage.caption) {
        text = message.imageMessage.caption;
      } else if (message.videoMessage && message.videoMessage.caption) {
        text = message.videoMessage.caption;
      }

      // Check for anti-features BEFORE processing commands
      if (isGroup && !m.key.fromMe) {
        await this.checkAntiFeatures(jid, m, text, sender);
      }

      if (!text || !text.startsWith(".")) return;

      // Prevent bot from responding to its own messages
      if (m.key.fromMe) return;

      const args = text.slice(1).trim().split(/\s+/);
      const command = args[0].toLowerCase();
      
      // Get mentioned users OR get user from quoted message
      let targetUsers = [];
      
      if (quotedMessage) {
        // Get user from quoted message
        const quotedParticipant = message.extendedTextMessage?.contextInfo?.participant;
        if (quotedParticipant) {
          targetUsers = [quotedParticipant];
        }
      } else if (message.extendedTextMessage?.contextInfo?.mentionedJid) {
        // Get mentioned users
        targetUsers = message.extendedTextMessage.contextInfo.mentionedJid.filter(jid => jid.includes('@s.whatsapp.net'));
      }

      this.stats.commandsExecuted++;

      // Route command to appropriate handler
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
        case 'tagall':
          await this.handleTagAll(jid, isGroup, sender, m);
          break;
        case 'mute':
          await this.handleMute(jid, isGroup, sender, true, m);
          break;
        case 'unmute':
          await this.handleMute(jid, isGroup, sender, false, m);
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
        case 'welcome':
          await this.handleWelcome(jid, isGroup, sender, m);
          break;
        case 'promote':
          await this.handlePromote(jid, isGroup, sender, targetUsers, m);
          break;
        case 'demote':
          await this.handleDemote(jid, isGroup, sender, targetUsers, m);
          break;
        case 'kick':
          await this.handleKick(jid, isGroup, sender, targetUsers, m);
          break;
        case 'setdesc':
          await this.handleSetDesc(jid, isGroup, sender, args.slice(1).join(" "), m);
          break;
        case 'antilink':
          await this.handleAntiLink(jid, isGroup, sender, m);
          break;
        case 'antisticker':
          await this.handleAntiSticker(jid, isGroup, sender, m);
          break;
        case 'antiaudio':
          await this.handleAntiAudio(jid, isGroup, sender, m);
          break;
        case 'setpp':
          await this.handleSetPP(jid, isGroup, sender, m);
          break;
        default:
          // Unknown command
          if (text.startsWith('.')) {
            await this.sock.sendMessage(jid, {
              text: `❌ Unknown command: *${command}*\n\nType *.help* to see all available commands.`,
              contextInfo: getNewsletterContext()
            }, { quoted: m });
          }
          break;
      }
    } catch (error) {
      this.stats.errors++;
      console.error("❌ Error in handleMessage:", error);
    }
  }

  async checkAntiFeatures(jid, m, text, sender) {
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    try {
      // Check for links
      if (settings.antilink && text) {
        const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+)/i.test(text);
        if (hasLink) {
          await this.sock.sendMessage(jid, {
            text: `⚠️ *Anti-Link Active*\nLinks are not allowed in this group!\nMessage from @${sender.split('@')[0]} has been deleted.`,
            mentions: [sender]
          });
          
          await this.sock.sendMessage(jid, {
            delete: m.key
          });
          return;
        }
      }

      // Check for stickers
      if (settings.antisticker && m.message.stickerMessage) {
        await this.sock.sendMessage(jid, {
          text: `⚠️ *Anti-Sticker Active*\nStickers are not allowed in this group!\nSticker from @${sender.split('@')[0]} has been deleted.`,
          mentions: [sender]
        });
        
        await this.sock.sendMessage(jid, {
          delete: m.key
        });
        return;
      }

      // Check for audio
      if (settings.antiaudio && m.message.audioMessage) {
        await this.sock.sendMessage(jid, {
          text: `⚠️ *Anti-Audio Active*\nAudio messages are not allowed in this group!\nAudio from @${sender.split('@')[0]} has been deleted.`,
          mentions: [sender]
        });
        
        await this.sock.sendMessage(jid, {
          delete: m.key
        });
      }
    } catch (error) {
      console.error("Error in anti-features:", error);
    }
  }

  async handleAlive(jid, originalMessage) {
    try {
      return await this.sock.sendMessage(jid, {
        image: { url: BOT_IMAGE_URL },
        caption: createStyledMessage("SYSTEM STATUS", 
          `✅ *Viral-Bot Mini* is *ALIVE* & *RUNNING*\n\n🟢 Status: ONLINE\n⏱️ Uptime: ${this.getUptime()}\n📦 Version: 2.0.0\n⚡ Commands: 20+ Active\n\nType *.menu* for all commands`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      // Fallback to text if image fails
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("SYSTEM STATUS", 
          `✅ *Viral-Bot Mini* is *ALIVE* & *RUNNING*\n\n🟢 Status: ONLINE\n⏱️ Uptime: ${this.getUptime()}\n📦 Version: 2.0.0\n⚡ Commands: 20+ Active\n\nType *.menu* for all commands`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handlePing(jid, originalMessage) {
    const start = Date.now();
    
    const pingMsg = await this.sock.sendMessage(jid, {
      text: "🏓 *Pinging...*",
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
    
    const latency = Date.now() - start;
    
    const status = latency < 500 ? 'Optimal ⚡' : latency < 1000 ? 'Good ✅' : 'Slow ⚠️';
    
    return await this.sock.sendMessage(jid, {
      text: createStyledMessage("PING TEST", 
        `🏓 *PONG!*\n\n📶 Latency: *${latency}ms*\n🟢 Status: ${status}\n🌐 Server: Active`),
      contextInfo: getNewsletterContext()
    }, { quoted: pingMsg });
  }

  async handleMenu(jid, originalMessage) {
    try {
      // First send image with caption
      await this.sock.sendMessage(jid, {
        image: { url: BOT_IMAGE_URL },
        caption: getCommandList(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      
      // Then send buttons separately
      await this.sock.sendMessage(jid, {
        text: "📢 *Want more updates and features?*",
        buttons: [
          {
            buttonId: "open_channel",
            buttonText: { displayText: "📢 Open Channel" },
            type: 1
          }
        ],
        contextInfo: getNewsletterContext()
      });
    } catch (error) {
      console.error("Error sending menu:", error);
      // Fallback to text only
      await this.sock.sendMessage(jid, {
        text: getCommandList(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleHelp(jid, originalMessage) {
    return await this.sock.sendMessage(jid, {
      text: getCommandList(),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleInfo(jid, originalMessage) {
    return await this.sock.sendMessage(jid, {
      text: getBotInfo(),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleStats(jid, originalMessage) {
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      const groupCount = Object.keys(groups).length;
      
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("BOT STATISTICS",
          `📊 *Usage Statistics*\n────────────────────\n📈 Commands Executed: ${this.stats.commandsExecuted}\n💬 Messages Processed: ${this.stats.messagesProcessed}\n👥 Active Groups: ${groupCount}\n⏱️ Uptime: ${this.getUptime()}\n❌ Errors: ${this.stats.errors}\n\n⚡ *Performance*\n────────────────────\n🚀 Response Time: < 1s\n💾 Memory: Optimized\n\n🔄 *Last Updated*\n────────────────────\n${new Date().toLocaleString()}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("BOT STATISTICS",
          `📊 *Usage Statistics*\n────────────────────\n📈 Commands Executed: ${this.stats.commandsExecuted}\n💬 Messages Processed: ${this.stats.messagesProcessed}\n⏱️ Uptime: ${this.getUptime()}\n❌ Errors: ${this.stats.errors}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleAbout(jid, originalMessage) {
    return await this.sock.sendMessage(jid, {
      text: getAbout(),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleTagAll(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in *groups*!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const settings = this.groupSettings.get(jid);
      const now = Date.now();
      
      // Cooldown check (3 minutes)
      if (now - settings.lastTagAll < 180000) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("COOLDOWN", "❌ Please wait *3 minutes* before using .tagall again!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
      
      settings.lastTagAll = now;
      this.groupSettings.set(jid, settings);

      const meta = await this.sock.groupMetadata(jid);
      const mentions = meta.participants.map(p => p.id);
      const mentionText = mentions.map(u => `@${u.split("@")[0]}`).join(" ");

      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("GROUP TAG",
          `📣 *TAG ALL MEMBERS*\n\n👥 Total Members: *${mentions.length}*\n\n${mentionText}`),
        mentions,
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ Failed to tag members! Make sure I'm admin."),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleMute(jid, isGroup, sender, shouldMute, originalMessage) {
    if (!isGroup) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in *groups*!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only *admins* can use this command!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      await this.sock.groupSettingUpdate(
        jid,
        shouldMute ? "announcement" : "not_announcement"
      );

      const action = shouldMute ? "🔇 GROUP MUTED" : "🔊 GROUP UNMUTED";
      const actionText = shouldMute ? "closed" : "opened";
      
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ADMIN ACTION",
          `${action}\n\n📛 Group: ${meta.subject}\n👤 Action by: @${sender.split("@")[0]}\n\nThe group has been ${actionText} for all members.`),
        mentions: [sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ Failed to mute/unmute group! Make sure I'm admin."),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleWelcome(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in *groups*!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only *admins* can change welcome settings!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const settings = this.groupSettings.get(jid);
      if (!settings) return;

      settings.welcome = !settings.welcome;
      this.groupSettings.set(jid, settings);

      const status = settings.welcome ? "ENABLED ✅" : "DISABLED ❌";
      const statusText = settings.welcome ? "enabled" : "disabled";
      
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("WELCOME SETTINGS",
          `🎉 Welcome messages have been *${status}*\n\n📛 Group: ${meta.subject}\n👤 Changed by: @${sender.split("@")[0]}\n\nWelcome messages are now ${statusText} for new members.`),
        mentions: [sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ Failed to update welcome settings!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handlePromote(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in *groups*!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only *admins* can promote users!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      if (targetUsers.length === 0) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("USAGE", 
            "Usage: *.promote @user*\nOR\nReply to a user's message with *.promote*\n\nExamples:\n- .promote @username\n- Reply to message with .promote"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const userToPromote = targetUsers[0];
      
      // Check if user is already admin
      const isAlreadyAdmin = admins.includes(userToPromote);
      if (isAlreadyAdmin) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("INFO", 
            `👑 User is *already an admin*!\n\n👤 User: @${userToPromote.split("@")[0]}`),
          mentions: [userToPromote],
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
      
      await this.sock.groupParticipantsUpdate(jid, [userToPromote], "promote");
      
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("PROMOTION SUCCESS",
          `👑 User *promoted to admin*!\n\n👤 User: @${userToPromote.split("@")[0]}\n👨‍💼 Promoted by: @${sender.split("@")[0]}\n\nUser now has admin privileges.`),
        mentions: [userToPromote, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `❌ Failed to promote user!\n\nError: ${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleDemote(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in *groups*!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only *admins* can demote users!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      if (targetUsers.length === 0) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("USAGE", 
            "Usage: *.demote @user*\nOR\nReply to a user's message with *.demote*\n\nExamples:\n- .demote @username\n- Reply to message with .demote"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const userToDemote = targetUsers[0];
      
      // Check if user is not an admin
      const isAdmin = admins.includes(userToDemote);
      if (!isAdmin) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("INFO", 
            `📉 User is *not an admin*!\n\n👤 User: @${userToDemote.split("@")[0]}`),
          mentions: [userToDemote],
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
      
      // Prevent demoting yourself if you're the only admin
      if (userToDemote === sender && admins.length === 1) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", 
            "❌ You cannot demote yourself as the *only admin*!\n\nPromote someone else first, then demote yourself."),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
      
      await this.sock.groupParticipantsUpdate(jid, [userToDemote], "demote");
      
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("DEMOTION SUCCESS",
          `📉 User *demoted from admin*!\n\n👤 User: @${userToDemote.split("@")[0]}\n👨‍💼 Demoted by: @${sender.split("@")[0]}\n\nUser no longer has admin privileges.`),
        mentions: [userToDemote, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `❌ Failed to demote user!\n\nError: ${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleKick(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in *groups*!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only *admins* can kick users!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      if (targetUsers.length === 0) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("USAGE", 
            "Usage: *.kick @user*\nOR\nReply to a user's message with *.kick*\n\nExamples:\n- .kick @username\n- Reply to message with .kick"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const userToKick = targetUsers[0];
      
      // Prevent kicking yourself
      if (userToKick === sender) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ You cannot kick yourself!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
      
      // Prevent kicking other admins
      if (admins.includes(userToKick)) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", 
            `❌ You cannot kick another admin!\n\nUse *.demote @${userToKick.split("@")[0]}* first, then kick.`),
          mentions: [userToKick],
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
      
      await this.sock.groupParticipantsUpdate(jid, [userToKick], "remove");
      
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("USER KICKED",
          `👢 User has been *kicked*!\n\n👤 User: @${userToKick.split("@")[0]}\n👨‍💼 Kicked by: @${sender.split("@")[0]}\n\nUser has been removed from the group.`),
        mentions: [userToKick, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `❌ Failed to kick user!\n\nError: ${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleSetDesc(jid, isGroup, sender, description, originalMessage) {
    if (!isGroup) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in *groups*!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only *admins* can change group description!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      if (!description || description.trim().length === 0) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("USAGE", "Usage: *.setdesc [new description]*\n\nExample: *.setdesc Welcome to our amazing group!*"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      await this.sock.groupUpdateDescription(jid, description.trim());
      
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("DESCRIPTION UPDATED",
          `📝 Group description *updated*!\n\n📛 Group: ${meta.subject}\n📋 New Description: ${description.trim()}\n👤 Changed by: @${sender.split("@")[0]}`),
        mentions: [sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `❌ Failed to update description!\n\nError: ${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleSetPP(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in *groups*!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only *admins* can change group profile picture!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      // Check if the message contains an image or is a reply to an image
      const quoted = originalMessage.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const hasImage = quoted?.imageMessage || originalMessage.message?.imageMessage;
      
      if (!hasImage) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("USAGE", 
            "Usage:\n1. *Reply to an image* with *.setpp*\nOR\n2. *Send an image* with caption *.setpp*\n\nExample: Send/reply to a photo with .setpp"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      // Download image
      const imageBuffer = await this.sock.downloadMediaMessage(
        quoted ? { message: quoted } : originalMessage
      );
      
      if (!imageBuffer) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Failed to download image! Please try again."),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      // Update group profile picture
      await this.sock.updateProfilePicture(jid, imageBuffer);
      
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("PROFILE PICTURE UPDATED",
          `🖼️ Group profile picture *updated*!\n\n📛 Group: ${meta.subject}\n👤 Changed by: @${sender.split("@")[0]}`),
        mentions: [sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Set PP error:", error);
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", `❌ Failed to update profile picture!\n\nError: ${error.message}`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleAntiLink(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in *groups*!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only *admins* can change anti-link settings!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const settings = this.groupSettings.get(jid);
      if (!settings) return;

      settings.antilink = !settings.antilink;
      this.groupSettings.set(jid, settings);

      const status = settings.antilink ? "ENABLED ✅" : "DISABLED ❌";
      const action = settings.antilink ? "will be automatically deleted ⚠️" : "are now allowed ✅";
      
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ANTI-LINK SETTINGS",
          `🔗 Anti-link protection has been *${status}*\n\n📛 Group: ${meta.subject}\n🔗 Links ${action}\n👤 Changed by: @${sender.split("@")[0]}`),
        mentions: [sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ Failed to update anti-link settings!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleAntiSticker(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in *groups*!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only *admins* can change anti-sticker settings!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const settings = this.groupSettings.get(jid);
      if (!settings) return;

      settings.antisticker = !settings.antisticker;
      this.groupSettings.set(jid, settings);

      const status = settings.antisticker ? "ENABLED ✅" : "DISABLED ❌";
      const action = settings.antisticker ? "will be automatically deleted ⚠️" : "are now allowed ✅";
      
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ANTI-STICKER SETTINGS",
          `😀 Anti-sticker protection has been *${status}*\n\n📛 Group: ${meta.subject}\n😀 Stickers ${action}\n👤 Changed by: @${sender.split("@")[0]}`),
        mentions: [sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ Failed to update anti-sticker settings!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleAntiAudio(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ This command only works in *groups*!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants
        .filter(p => p.admin)
        .map(p => p.id);

      if (!admins.includes(sender)) {
        return await this.sock.sendMessage(jid, {
          text: createStyledMessage("ERROR", "❌ Only *admins* can change anti-audio settings!"),
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }

      const settings = this.groupSettings.get(jid);
      if (!settings) return;

      settings.antiaudio = !settings.antiaudio;
      this.groupSettings.set(jid, settings);

      const status = settings.antiaudio ? "ENABLED ✅" : "DISABLED ❌";
      const action = settings.antiaudio ? "will be automatically deleted ⚠️" : "are now allowed ✅";
      
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ANTI-AUDIO SETTINGS",
          `🎵 Anti-audio protection has been *${status}*\n\n📛 Group: ${meta.subject}\n🎵 Audio messages ${action}\n👤 Changed by: @${sender.split("@")[0]}`),
        mentions: [sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      return await this.sock.sendMessage(jid, {
        text: createStyledMessage("ERROR", "❌ Failed to update anti-audio settings!"),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }
}

module.exports = CommandHandler;