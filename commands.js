// commands.js - Fixed for Baileys 6.5.0
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

      // Button click handler
      if (m.message?.buttonsResponseMessage) {
        const btn = m.message.buttonsResponseMessage.selectedButtonId;
        if (btn === "open_channel") {
          await this.sock.sendMessage(jid, {
            text: `📢 *${CHANNEL_NAME}*\n\nFollow our channel:\n${CHANNEL_LINK}`
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

      if (!text || !text.startsWith(".")) return;
      if (m.key.fromMe) return;

      const args = text.slice(1).trim().split(/\s+/);
      const command = args[0].toLowerCase();
      
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
          const targetUsers = this.getTargetUsers(m, message, quotedMessage);
          await this.handlePromote(jid, isGroup, sender, targetUsers, m);
          break;
        case 'demote':
          const targetUsers2 = this.getTargetUsers(m, message, quotedMessage);
          await this.handleDemote(jid, isGroup, sender, targetUsers2, m);
          break;
        case 'kick':
          const targetUsers3 = this.getTargetUsers(m, message, quotedMessage);
          await this.handleKick(jid, isGroup, sender, targetUsers3, m);
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
              text: `❌ Unknown command: ${command}\nType .help for commands`
            }, { quoted: m });
          }
          break;
      }
    } catch (error) {
      console.error("Handle message error:", error.message);
    }
  }

  getTargetUsers(m, message, quotedMessage) {
    let targetUsers = [];
    
    if (quotedMessage) {
      const quotedParticipant = message.extendedTextMessage?.contextInfo?.participant;
      if (quotedParticipant) targetUsers = [quotedParticipant];
    } else if (message.extendedTextMessage?.contextInfo?.mentionedJid) {
      targetUsers = message.extendedTextMessage.contextInfo.mentionedJid;
    }
    
    return targetUsers;
  }

  async handleAlive(jid, originalMessage) {
    try {
      await this.sock.sendMessage(jid, {
        image: { url: BOT_IMAGE_URL },
        caption: createStyledMessage("SYSTEM STATUS", 
          `✅ Viral-Bot Mini is ALIVE\n\nStatus: ONLINE\nUptime: ${this.getUptime()}\nVersion: 2.0.0`),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: createStyledMessage("SYSTEM STATUS", 
          `✅ Viral-Bot Mini is ALIVE\n\nStatus: ONLINE\nUptime: ${this.getUptime()}\nVersion: 2.0.0`)
      }, { quoted: originalMessage });
    }
  }

  async handlePing(jid, originalMessage) {
    const start = Date.now();
    await this.sock.sendMessage(jid, {
      text: "🏓 Pinging..."
    }, { quoted: originalMessage });
    
    const latency = Date.now() - start;
    
    await this.sock.sendMessage(jid, {
      text: createStyledMessage("PING TEST", 
        `🏓 PONG!\nLatency: ${latency}ms\nStatus: ${latency < 500 ? 'Optimal' : 'Good'}`)
    }, { quoted: originalMessage });
  }

  async handleMenu(jid, originalMessage) {
    try {
      // Send image with caption
      await this.sock.sendMessage(jid, {
        image: { url: BOT_IMAGE_URL },
        caption: getCommandList(),
        contextInfo: getNewsletterContext()
      }, { quoted: originalMessage });
      
      // Send button separately
      setTimeout(async () => {
        try {
          await this.sock.sendMessage(jid, {
            text: "📢 Want updates?",
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
          console.log("Button error:", error.message);
        }
      }, 500);
      
    } catch (error) {
      console.log("Menu image error, sending text:", error.message);
      await this.sock.sendMessage(jid, {
        text: getCommandList()
      }, { quoted: originalMessage });
    }
  }

  async handleHelp(jid, originalMessage) {
    await this.sock.sendMessage(jid, {
      text: getCommandList()
    }, { quoted: originalMessage });
  }

  async handleInfo(jid, originalMessage) {
    await this.sock.sendMessage(jid, {
      text: getBotInfo()
    }, { quoted: originalMessage });
  }

  async handleStats(jid, originalMessage) {
    const uptime = this.getUptime();
    await this.sock.sendMessage(jid, {
      text: createStyledMessage("BOT STATS",
        `📊 Bot Statistics\n────────────────\nCommands: ${this.stats.commandsExecuted}\nMessages: ${this.stats.messagesProcessed}\nUptime: ${uptime}`)
    }, { quoted: originalMessage });
  }

  async handleAbout(jid, originalMessage) {
    await this.sock.sendMessage(jid, {
      text: getAbout()
    }, { quoted: originalMessage });
  }

  async handleTagAll(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only"
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
        mentions
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to tag members"
      }, { quoted: originalMessage });
    }
  }

  async handleMute(jid, isGroup, sender, shouldMute, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only"
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command"
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
        mentions: [sender]
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to mute/unmute"
      }, { quoted: originalMessage });
    }
  }

  async handleWelcome(jid, isGroup, sender, originalMessage) {
    await this.toggleGroupFeature(jid, isGroup, sender, "welcome", "Welcome Messages", originalMessage);
  }

  async handleAntiLink(jid, isGroup, sender, originalMessage) {
    await this.toggleGroupFeature(jid, isGroup, sender, "antilink", "Anti-Link", originalMessage);
  }

  async handleAntiSticker(jid, isGroup, sender, originalMessage) {
    await this.toggleGroupFeature(jid, isGroup, sender, "antisticker", "Anti-Sticker", originalMessage);
  }

  async handleAntiAudio(jid, isGroup, sender, originalMessage) {
    await this.toggleGroupFeature(jid, isGroup, sender, "antiaudio", "Anti-Audio", originalMessage);
  }

  async toggleGroupFeature(jid, isGroup, sender, feature, featureName, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only"
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command"
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
          mentions: [sender]
        }, { quoted: originalMessage });
      }
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: `❌ Failed to update ${featureName}`
      }, { quoted: originalMessage });
    }
  }

  async handlePromote(jid, isGroup, sender, targetUsers, originalMessage) {
    await this.handleAdminAction(jid, isGroup, sender, targetUsers, "promote", "promoted to admin", originalMessage);
  }

  async handleDemote(jid, isGroup, sender, targetUsers, originalMessage) {
    await this.handleAdminAction(jid, isGroup, sender, targetUsers, "demote", "demoted from admin", originalMessage);
  }

  async handleKick(jid, isGroup, sender, targetUsers, originalMessage) {
    await this.handleAdminAction(jid, isGroup, sender, targetUsers, "remove", "kicked from group", originalMessage);
  }

  async handleAdminAction(jid, isGroup, sender, targetUsers, action, actionText, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only"
      }, { quoted: originalMessage });
      return;
    }

    if (targetUsers.length === 0) {
      await this.sock.sendMessage(jid, {
        text: `Usage: .${action} @user\nOr reply to user's message`
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command"
        }, { quoted: originalMessage });
        return;
      }

      const user = targetUsers[0];
      await this.sock.groupParticipantsUpdate(jid, [user], action);
      
      await this.sock.sendMessage(jid, {
        text: createStyledMessage(action.toUpperCase(),
          `👤 @${user.split("@")[0]} ${actionText}\nBy: @${sender.split("@")[0]}`),
        mentions: [user, sender]
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: `❌ Failed to ${action} user`
      }, { quoted: originalMessage });
    }
  }

  async handleSetDesc(jid, isGroup, sender, description, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only"
      }, { quoted: originalMessage });
      return;
    }

    if (!description) {
      await this.sock.sendMessage(jid, {
        text: "Usage: .setdesc [description text]"
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command"
        }, { quoted: originalMessage });
        return;
      }

      await this.sock.groupUpdateDescription(jid, description);
      
      await this.sock.sendMessage(jid, {
        text: createStyledMessage("DESCRIPTION UPDATED",
          `📝 Description updated\nGroup: ${meta.subject}\nBy: @${sender.split("@")[0]}`),
        mentions: [sender]
      }, { quoted: originalMessage });
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to update description"
      }, { quoted: originalMessage });
    }
  }

  async handleSetPP(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command works in groups only"
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Admin only command"
        }, { quoted: originalMessage });
        return;
      }

      const quoted = originalMessage.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const hasImage = quoted?.imageMessage || originalMessage.message?.imageMessage;
      
      if (!hasImage) {
        await this.sock.sendMessage(jid, {
          text: "Reply to an image with .setpp"
        }, { quoted: originalMessage });
        return;
      }

      const stream = await this.sock.downloadMediaMessage(
        quoted ? { message: quoted } : originalMessage
      );
      
      if (stream) {
        const buffer = Buffer.from(await stream.arrayBuffer());
        await this.sock.updateProfilePicture(jid, buffer);
        
        await this.sock.sendMessage(jid, {
          text: createStyledMessage("PROFILE PICTURE",
            `🖼️ Group picture updated\nBy: @${sender.split("@")[0]}`),
          mentions: [sender]
        }, { quoted: originalMessage });
      }
    } catch (error) {
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to update picture"
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