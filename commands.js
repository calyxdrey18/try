// commands.js - Fixed message parsing
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
    
    console.log("✅ Command Handler Ready");
  }

  async handleMessage(m) {
    try {
      const jid = m.key.remoteJid;
      if (!jid) {
        console.log("❌ No JID");
        return;
      }

      // Skip status broadcasts
      if (jid === "status@broadcast") {
        return;
      }

      this.stats.messagesProcessed++;
      console.log(`📊 Message ${this.stats.messagesProcessed} from ${jid}`);

      const isGroup = jid.endsWith("@g.us");
      const sender = isGroup ? (m.key.participant || jid) : jid;

      console.log(`👤 Sender: ${sender}`);
      console.log(`🏷️ Is Group: ${isGroup}`);

      // Initialize group settings
      if (isGroup && !this.groupSettings.has(jid)) {
        this.groupSettings.set(jid, {
          welcome: true,
          antilink: false,
          antisticker: false,
          antiaudio: false
        });
        console.log(`⚙️ Group settings initialized for ${jid}`);
      }

      // Button clicks
      if (m.message?.buttonsResponseMessage) {
        const btn = m.message.buttonsResponseMessage.selectedButtonId;
        console.log(`🔄 Button clicked: ${btn}`);
        
        if (btn === "open_channel") {
          await this.sock.sendMessage(jid, {
            text: `📢 *${CHANNEL_NAME}*\n\nFollow our channel for updates:\n${CHANNEL_LINK}`
          });
          return;
        }
      }

      // Extract text from message
      let text = "";
      const messageTypes = Object.keys(m.message);
      
      console.log(`📦 Message types: ${messageTypes.join(", ")}`);

      if (messageTypes.includes("conversation")) {
        text = m.message.conversation || "";
      } else if (messageTypes.includes("extendedTextMessage")) {
        text = m.message.extendedTextMessage?.text || "";
      } else if (messageTypes.includes("imageMessage")) {
        text = m.message.imageMessage?.caption || "";
      }

      console.log(`📝 Extracted text: "${text}"`);

      // Check if message starts with command prefix
      if (!text.startsWith(".")) {
        console.log("⏭️ Not a command, skipping");
        return;
      }

      // Skip bot's own messages (prevent loops)
      if (m.key.fromMe) {
        console.log("🤖 Skipping own command");
        return;
      }

      const args = text.slice(1).trim().split(/\s+/);
      const command = args[0].toLowerCase();
      
      console.log(`⚡ Command detected: ${command}`);
      console.log(`🔧 Args: ${args.slice(1).join(", ")}`);

      this.stats.commandsExecuted++;

      // Handle command
      switch(command) {
        case 'alive':
          console.log("🟢 Processing .alive");
          await this.handleAlive(jid, m);
          break;
          
        case 'ping':
          console.log("🏓 Processing .ping");
          await this.handlePing(jid, m);
          break;
          
        case 'menu':
          console.log("📋 Processing .menu");
          await this.handleMenu(jid, m);
          break;
          
        case 'help':
          console.log("❓ Processing .help");
          await this.handleHelp(jid, m);
          break;
          
        case 'info':
          console.log("ℹ️ Processing .info");
          await this.handleInfo(jid, m);
          break;
          
        case 'stats':
          console.log("📊 Processing .stats");
          await this.handleStats(jid, m);
          break;
          
        case 'about':
          console.log("👤 Processing .about");
          await this.handleAbout(jid, m);
          break;
          
        case 'tagall':
          console.log("🏷️ Processing .tagall");
          await this.handleTagAll(jid, isGroup, sender, m);
          break;
          
        case 'mute':
          console.log("🔇 Processing .mute");
          await this.handleMute(jid, isGroup, sender, true, m);
          break;
          
        case 'unmute':
          console.log("🔊 Processing .unmute");
          await this.handleMute(jid, isGroup, sender, false, m);
          break;
          
        case 'welcome':
          console.log("🎉 Processing .welcome");
          await this.handleWelcome(jid, isGroup, sender, m);
          break;
          
        case 'antilink':
          console.log("🔗 Processing .antilink");
          await this.handleAntiLink(jid, isGroup, sender, m);
          break;
          
        case 'antisticker':
          console.log("😀 Processing .antisticker");
          await this.handleAntiSticker(jid, isGroup, sender, m);
          break;
          
        case 'antiaudio':
          console.log("🎵 Processing .antiaudio");
          await this.handleAntiAudio(jid, isGroup, sender, m);
          break;
          
        case 'promote':
          console.log("👑 Processing .promote");
          const targetUsers = this.getTargetUsers(m);
          await this.handlePromote(jid, isGroup, sender, targetUsers, m);
          break;
          
        case 'demote':
          console.log("📉 Processing .demote");
          const targetUsers2 = this.getTargetUsers(m);
          await this.handleDemote(jid, isGroup, sender, targetUsers2, m);
          break;
          
        case 'kick':
          console.log("👢 Processing .kick");
          const targetUsers3 = this.getTargetUsers(m);
          await this.handleKick(jid, isGroup, sender, targetUsers3, m);
          break;
          
        case 'setdesc':
          console.log("📝 Processing .setdesc");
          await this.handleSetDesc(jid, isGroup, sender, args.slice(1).join(" "), m);
          break;
          
        case 'setpp':
          console.log("🖼️ Processing .setpp");
          await this.handleSetPP(jid, isGroup, sender, m);
          break;
          
        default:
          console.log(`❓ Unknown command: ${command}`);
          await this.sock.sendMessage(jid, {
            text: `❌ Unknown command: *${command}*\n\nType *.help* to see available commands.`
          }, { quoted: m });
          break;
      }

      console.log(`✅ Command ${command} processed successfully`);

    } catch (error) {
      console.error("❌ Error in handleMessage:", error.message);
      console.error("Stack:", error.stack);
      
      // Try to send error message
      try {
        if (m && m.key && m.key.remoteJid) {
          await this.sock.sendMessage(m.key.remoteJid, {
            text: `❌ Error processing command: ${error.message}`
          });
        }
      } catch (sendError) {
        console.error("Failed to send error message:", sendError.message);
      }
    }
  }

  getTargetUsers(m) {
    let targetUsers = [];
    
    // Check for quoted message
    if (m.message?.extendedTextMessage?.contextInfo?.participant) {
      targetUsers = [m.message.extendedTextMessage.contextInfo.participant];
      console.log(`🎯 Target from quote: ${targetUsers[0]}`);
    }
    // Check for mentions
    else if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
      targetUsers = m.message.extendedTextMessage.contextInfo.mentionedJid;
      console.log(`🎯 Targets from mentions: ${targetUsers.join(", ")}`);
    }
    
    return targetUsers;
  }

  async handleAlive(jid, originalMessage) {
    try {
      console.log(`🖼️ Sending alive image to ${jid}`);
      await this.sock.sendMessage(jid, {
        image: { url: BOT_IMAGE_URL },
        caption: createStyledMessage("SYSTEM STATUS", 
          `✅ *Viral-Bot Mini* is *ALIVE* & *RUNNING*\n\n🟢 Status: ONLINE\n⏱️ Uptime: ${this.getUptime()}\n📦 Version: 2.0.0\n⚡ Commands: Active`)
      }, { quoted: originalMessage });
    } catch (error) {
      console.log("⚠️ Image failed, sending text instead:", error.message);
      await this.sock.sendMessage(jid, {
        text: createStyledMessage("SYSTEM STATUS", 
          `✅ *Viral-Bot Mini* is *ALIVE* & *RUNNING*\n\n🟢 Status: ONLINE\n⏱️ Uptime: ${this.getUptime()}\n📦 Version: 2.0.0`)
      }, { quoted: originalMessage });
    }
  }

  async handlePing(jid, originalMessage) {
    const start = Date.now();
    
    await this.sock.sendMessage(jid, {
      text: "🏓 *Pinging...*"
    }, { quoted: originalMessage });
    
    const latency = Date.now() - start;
    
    await this.sock.sendMessage(jid, {
      text: createStyledMessage("PING TEST", 
        `🏓 *PONG!*\n\n📶 Latency: *${latency}ms*\n🟢 Status: ${latency < 500 ? 'Optimal ⚡' : 'Good ✅'}`)
    }, { quoted: originalMessage });
  }

  async handleMenu(jid, originalMessage) {
    try {
      console.log(`📋 Sending menu to ${jid}`);
      
      // First send image with caption
      await this.sock.sendMessage(jid, {
        image: { url: BOT_IMAGE_URL },
        caption: getCommandList()
      }, { quoted: originalMessage });
      
      console.log("✅ Menu image sent");
      
      // Then send buttons
      setTimeout(async () => {
        try {
          await this.sock.sendMessage(jid, {
            text: "📢 *Want more updates and features?*",
            buttons: [
              {
                buttonId: "open_channel",
                buttonText: { displayText: "📢 Open Channel" },
                type: 1
              }
            ]
          });
          console.log("✅ Menu buttons sent");
        } catch (error) {
          console.log("⚠️ Buttons failed:", error.message);
        }
      }, 500);
      
    } catch (error) {
      console.log("❌ Menu image failed, sending text:", error.message);
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
    await this.sock.sendMessage(jid, {
      text: createStyledMessage("BOT STATISTICS",
        `📊 *Usage Statistics*\n────────────────\n📈 Commands: ${this.stats.commandsExecuted}\n💬 Messages: ${this.stats.messagesProcessed}\n⏱️ Uptime: ${this.getUptime()}`)
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
        text: "❌ This command only works in *groups*!"
      }, { quoted: originalMessage });
      return;
    }

    try {
      console.log(`🏷️ Tagging all in group ${jid}`);
      const meta = await this.sock.groupMetadata(jid);
      const mentions = meta.participants.map(p => p.id);
      const mentionText = mentions.map(u => `@${u.split("@")[0]}`).join(" ");

      await this.sock.sendMessage(jid, {
        text: createStyledMessage("GROUP TAG",
          `📣 *TAG ALL MEMBERS*\n\n👥 Total: *${mentions.length}* members\n\n${mentionText}`),
        mentions
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Tagall error:", error.message);
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to tag members!"
      }, { quoted: originalMessage });
    }
  }

  async handleMute(jid, isGroup, sender, shouldMute, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command only works in *groups*!"
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Only *admins* can use this command!"
        }, { quoted: originalMessage });
        return;
      }

      await this.sock.groupSettingUpdate(
        jid,
        shouldMute ? "announcement" : "not_announcement"
      );

      await this.sock.sendMessage(jid, {
        text: createStyledMessage("GROUP ACTION",
          `${shouldMute ? "🔇 GROUP MUTED" : "🔊 GROUP UNMUTED"}\n\n📛 Group: ${meta.subject}\n👤 By: @${sender.split("@")[0]}`),
        mentions: [sender]
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("Mute error:", error.message);
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to mute/unmute group!"
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
        text: "❌ This command only works in *groups*!"
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Only *admins* can change settings!"
        }, { quoted: originalMessage });
        return;
      }

      const settings = this.groupSettings.get(jid);
      if (settings) {
        settings[feature] = !settings[feature];
        const status = settings[feature] ? "ENABLED ✅" : "DISABLED ❌";
        
        await this.sock.sendMessage(jid, {
          text: createStyledMessage(`${featureName.toUpperCase()} SETTINGS`,
            `${featureName}: ${status}\n\n📛 Group: ${meta.subject}\n👤 By: @${sender.split("@")[0]}`),
          mentions: [sender]
        }, { quoted: originalMessage });
      }
    } catch (error) {
      console.error(`${featureName} error:`, error.message);
      await this.sock.sendMessage(jid, {
        text: `❌ Failed to update ${featureName}!`
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
        text: "❌ This command only works in *groups*!"
      }, { quoted: originalMessage });
      return;
    }

    if (targetUsers.length === 0) {
      await this.sock.sendMessage(jid, {
        text: `Usage: *.${action} @user*\nOR\nReply to user's message with *.${action}*`
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Only *admins* can use this command!"
        }, { quoted: originalMessage });
        return;
      }

      const user = targetUsers[0];
      await this.sock.groupParticipantsUpdate(jid, [user], action);
      
      await this.sock.sendMessage(jid, {
        text: createStyledMessage(action.toUpperCase(),
          `👤 @${user.split("@")[0]} ${actionText}\n\n👨‍💼 By: @${sender.split("@")[0]}`),
        mentions: [user, sender]
      }, { quoted: originalMessage });
    } catch (error) {
      console.error(`${action} error:`, error.message);
      await this.sock.sendMessage(jid, {
        text: `❌ Failed to ${action} user!`
      }, { quoted: originalMessage });
    }
  }

  async handleSetDesc(jid, isGroup, sender, description, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command only works in *groups*!"
      }, { quoted: originalMessage });
      return;
    }

    if (!description) {
      await this.sock.sendMessage(jid, {
        text: "Usage: *.setdesc [new description]*\n\nExample: *.setdesc Welcome to our group!*"
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Only *admins* can change description!"
        }, { quoted: originalMessage });
        return;
      }

      await this.sock.groupUpdateDescription(jid, description);
      
      await this.sock.sendMessage(jid, {
        text: createStyledMessage("DESCRIPTION UPDATED",
          `📝 Description updated!\n\n📛 Group: ${meta.subject}\n📋 New: ${description}\n👤 By: @${sender.split("@")[0]}`),
        mentions: [sender]
      }, { quoted: originalMessage });
    } catch (error) {
      console.error("SetDesc error:", error.message);
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to update description!"
      }, { quoted: originalMessage });
    }
  }

  async handleSetPP(jid, isGroup, sender, originalMessage) {
    if (!isGroup) {
      await this.sock.sendMessage(jid, {
        text: "❌ This command only works in *groups*!"
      }, { quoted: originalMessage });
      return;
    }

    try {
      const meta = await this.sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);

      if (!admins.includes(sender)) {
        await this.sock.sendMessage(jid, {
          text: "❌ Only *admins* can change group picture!"
        }, { quoted: originalMessage });
        return;
      }

      // Check for image in message
      const quoted = originalMessage.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const hasImage = quoted?.imageMessage || originalMessage.message?.imageMessage;
      
      if (!hasImage) {
        await this.sock.sendMessage(jid, {
          text: "Reply to an image with *.setpp*\nOR\nSend an image with caption *.setpp*"
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
            `🖼️ Group picture updated!\n\n📛 Group: ${meta.subject}\n👤 By: @${sender.split("@")[0]}`),
          mentions: [sender]
        }, { quoted: originalMessage });
      }
    } catch (error) {
      console.error("SetPP error:", error.message);
      await this.sock.sendMessage(jid, {
        text: "❌ Failed to update picture!"
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