// commands.js - Fixed for menu with image
const { 
  BOT_IMAGE_URL,
  CHANNEL_NAME, 
  CHANNEL_LINK, 
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
      startTime: Date.now()
    };
    this.groupSettings = new Map();
  }

  async handleMessage(m) {
    try {
      const jid = m.key.remoteJid;
      if (!jid || jid === "status@broadcast") return;

      this.stats.messagesProcessed++;

      const isGroup = jid.endsWith("@g.us");
      const sender = isGroup ? (m.key.participant || jid) : jid;

      if (isGroup && !this.groupSettings.has(jid)) {
        this.groupSettings.set(jid, {
          welcome: true,
          antilink: false,
          antisticker: false,
          antiaudio: false
        });
      }

      // Button click
      if (m.message?.buttonsResponseMessage) {
        const btn = m.message.buttonsResponseMessage.selectedButtonId;
        if (btn === "open_channel") {
          await this.sock.sendMessage(jid, {
            text: `📢 *${CHANNEL_NAME}*\n\nFollow our channel:\n${CHANNEL_LINK}`,
            contextInfo: getNewsletterContext()
          });
          return;
        }
      }

      // Extract text
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
      }

      // Check anti-features
      if (isGroup && !m.key.fromMe) {
        await this.checkAntiFeatures(jid, m, text, sender);
      }

      if (!text || !text.startsWith(".")) return;
      if (m.key.fromMe) return;

      const args = text.slice(1).trim().split(/\s+/);
      const command = args[0].toLowerCase();
      
      let targetUsers = [];
      if (quotedMessage) {
        const quotedParticipant = message.extendedTextMessage?.contextInfo?.participant;
        if (quotedParticipant) targetUsers = [quotedParticipant];
      } else if (message.extendedTextMessage?.contextInfo?.mentionedJid) {
        targetUsers = message.extendedTextMessage.contextInfo.mentionedJid;
      }

      this.stats.commandsExecuted++;

      // Command routing
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
          if (text.startsWith('.')) {
            await this.sock.sendMessage(jid, {
              text: `❌ Unknown command: ${command}\nType .help for commands`,
              contextInfo: getNewsletterContext()
            }, { quoted: m });
          }
          break;
      }
    } catch (error) {
      console.error("Handle message error:", error);
    }
  }

  async checkAntiFeatures(jid, m, text, sender) {
    const settings = this.groupSettings.get(jid);
    if (!settings) return;

    try {
      if (settings.antilink && text && /(https?:\/\/|www\.)/i.test(text)) {
        await this.sock.sendMessage(jid, {
          text: `⚠️ Anti-Link: Link deleted from @${sender.split('@')[0]}`,
          mentions: [sender]
        });
        await this.sock.sendMessage(jid, { delete: m.key });
      }

      if (settings.antisticker && m.message.stickerMessage) {
        await this.sock.sendMessage(jid, {
          text: `⚠️ Anti-Sticker: Sticker deleted from @${sender.split('@')[0]}`,
          mentions: [sender]
        });
        await this.sock.sendMessage(jid, { delete: m.key });
      }

      if (settings.antiaudio && m.message.audioMessage) {
        await this.sock.sendMessage(jid, {
          text: `⚠️ Anti-Audio: Audio deleted from @${sender.split('@')[0]}`,
          mentions: [sender]
        });
        await this.sock.sendMessage(jid, { delete: m.key });
      }
    } catch (error) {
      console.error("Anti-features error:", error);
    }
  }

  async handleAlive(jid, originalMessage) {
    try {
      await this.sock.sendMessage(jid, {
        image: { url: BOT_IMAGE_URL },
        caption: createStyledMessage("SYSTEM STATUS", 
          `✅ Viral-Bot Mini is ALIVE\n\nStatus: ONLINE\nUptime: ${this.getUptime()}\nVersion: 2.0.0\nCommands: Active`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: createStyledMessage("SYSTEM STATUS", 
          `✅ Viral-Bot Mini is ALIVE\n\nStatus: ONLINE\nUptime: ${this.getUptime()}\nVersion: 2.0.0`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handlePing(jid, originalMessage) {
    const start = Date.now();
    await this.sock.sendMessage(jid, {
      text: "🏓 Pinging...",
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
    
    const latency = Date.now() - start;
    
    await this.sock.sendMessage(jid, {
      text: createStyledMessage("PING TEST", 
        `🏓 PONG!\nLatency: ${latency}ms\nStatus: ${latency < 500 ? 'Optimal' : 'Good'}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
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
        text: "📢 Need updates?",
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
      console.log("Menu image error, sending text:", error);
      await this.sock.sendMessage(jid, {
        text: getCommandList(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleHelp(jid, originalMessage) {
    await this.sock.sendMessage(jid, {
      text: getCommandList(),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleInfo(jid, originalMessage) {
    await this.sock.sendMessage(jid, {
      text: getBotInfo(),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleStats(jid, originalMessage) {
    const uptime = this.getUptime();
    await this.sock.sendMessage(jid, {
      text: createStyledMessage("BOT STATS",
        `📊 Bot Statistics\n────────────────\nCommands: ${this.stats.commandsExecuted}\nMessages: ${this.stats.messagesProcessed}\nUptime: ${uptime}\n\n${new Date().toLocaleString()}`),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleAbout(jid, originalMessage) {
    await this.sock.sendMessage(jid, {
      text: getAbout(),
      contextInfo: getNewsletterContext()
    }, { quoted: originalMessage });
  }

  async handleTagAll(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const mentions = meta.participants.map(p => p.id);
      const mentionText = mentions.map(u => `@${u.split("@")[0]}`).join(" ");

      await this.sock.sendMessage(jid, {
        text: createStyledMessage("TAG ALL",
          `📣 Tagging ${mentions.length} members\n\n${mentionText}`),
        mentions,
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to tag members",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleMute(jid, isGroup, sender, shouldMute, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command",
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
        return;
      }

      await this.sock.groupSettingUpdate(
        jid,
        shouldMute ? "announcement" : "not_announcement"
      );

      await this.sock.sendMessage(jid, {
        text: createStyledMessage("GROUP ACTION",
          `${shouldMute ? "🔇 MUTED" : "🔊 UNMUTED"}\nGroup: ${meta.subject}\nBy: @${sender.split("@")[0]}`),
        mentions: [sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to mute/unmute",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleWelcome(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command",
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
        return;
      }

      const settings = this.groupSettings.get(jid);
      if (settings) {
        settings.welcome = !settings.welcome;
        const status = settings.welcome ? "ENABLED ✅" : "DISABLED ❌";
        
        await this.sock.sendMessage(jid, {
          text: createStyledMessage("WELCOME SETTINGS",
            `Welcome messages: ${status}\nGroup: ${meta.subject}\nBy: @${sender.split("@")[0]}`),
          mentions: [sender],
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to update settings",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handlePromote(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    if (targetUsers.length === 0) {
      await this.sock.sendMessage(jid, {
        text: "Usage: .promote @user\nOr reply to user's message",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command",
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
        return;
      }

      const user = targetUsers[0];
      await this.sock.groupParticipantsUpdate(jid, [user], "promote");
      
      await this.sock.sendMessage(jid, {
        text: createStyledMessage("PROMOTION",
          `👑 @${user.split("@")[0]} promoted to admin\nBy: @${sender.split("@")[0]}`),
        mentions: [user, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to promote user",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleDemote(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    if (targetUsers.length === 0) {
      await this.sock.sendMessage(jid, {
        text: "Usage: .demote @user\nOr reply to user's message",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command",
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
        return;
      }

      const user = targetUsers[0];
      await this.sock.groupParticipantsUpdate(jid, [user], "demote");
      
      await this.sock.sendMessage(jid, {
        text: createStyledMessage("DEMOTION",
          `📉 @${user.split("@")[0]} demoted from admin\nBy: @${sender.split("@")[0]}`),
        mentions: [user, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to demote user",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleKick(jid, isGroup, sender, targetUsers, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    if (targetUsers.length === 0) {
      await this.sock.sendMessage(jid, {
        text: "Usage: .kick @user\nOr reply to user's message",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command",
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
        return;
      }

      const user = targetUsers[0];
      await this.sock.groupParticipantsUpdate(jid, [user], "remove");
      
      await this.sock.sendMessage(jid, {
        text: createStyledMessage("USER KICKED",
          `👢 @${user.split("@")[0]} kicked from group\nBy: @${sender.split("@")[0]}`),
        mentions: [user, sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to kick user",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleSetDesc(jid, isGroup, sender, description, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    if (!description) {
      await this.sock.sendMessage(jid, {
        text: "Usage: .setdesc [description text]",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command",
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
        return;
      }

      await this.sock.groupUpdateDescription(jid, description);
      
      await this.sock.sendMessage(jid, {
        text: createStyledMessage("DESCRIPTION UPDATED",
          `📝 Description updated\nGroup: ${meta.subject}\nBy: @${sender.split("@")[0]}`),
        mentions: [sender],
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to update description",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleSetPP(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command",
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
        return;
      }

      const quoted = originalMessage.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const hasImage = quoted?.imageMessage || originalMessage.message?.imageMessage;
      
      if (!hasImage) {
        await this.sock.sendMessage(jid, {
          text: "Reply to an image with .setpp",
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
        return;
      }

      const imageBuffer = await this.sock.downloadMediaMessage(
        quoted ? { message: quoted } : originalMessage
      );
      
      if (imageBuffer) {
        await this.sock.updateProfilePicture(jid, imageBuffer);
        
        await this.sock.sendMessage(jid, {
          text: createStyledMessage("PROFILE PICTURE",
            `🖼️ Group picture updated\nBy: @${sender.split("@")[0]}`),
          mentions: [sender],
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to update picture",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  async handleAntiLink(jid, isGroup, sender, originalMessage) {
    await this.toggleAntiFeature(jid, isGroup, sender, "antilink", "Anti-Link", originalMessage);
  }

  async handleAntiSticker(jid, isGroup, sender, originalMessage) {
    await this.toggleAntiFeature(jid, isGroup, sender, "antisticker", "Anti-Sticker", originalMessage);
  }

  async handleAntiAudio(jid, isGroup, sender, originalMessage) {
    await this.toggleAntiFeature(jid, isGroup, sender, "antiaudio", "Anti-Audio", originalMessage);
  }

  async toggleAntiFeature(jid, isGroup, sender, feature, featureName, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only",
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command",
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
        return;
      }

      const settings = this.groupSettings.get(jid);
      if (settings) {
        settings[feature] = !settings[feature];
        const status = settings[feature] ? "ENABLED ✅" : "DISABLED ❌";
        
        await this.sock.sendMessage(jid, {
          text: createStyledMessage(`${featureName.toUpperCase()} SETTINGS`,
            `${featureName}: ${status}\nGroup: ${meta.subject}\nBy: @${sender.split("@")[0]}`),
          mentions: [sender],
          contextInfo: getNewsletterContext()
        }, { quoted: originalMessage });
      }
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: `❌ Failed to update ${featureName}`,
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    }
  }

  getUptime() {
    const uptime = Date.now() - this.stats.startTime;
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }
}

module.exports = CommandHandler;