// server.js - FIXED PAIRING VERSION
const express = require("express");
const path = require("path");
const fs = require("fs");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");
const CommandHandler = require("./commands");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Global variables
let sock = null;
let pairingCode = null;
let commandHandler = null;
let isConnected = false;
let qrCode = null;

// Health check for Render
app.get("/health", (req, res) => {
  res.json({ 
    status: "running", 
    connected: isConnected,
    hasPairingCode: !!pairingCode
  });
});

// Status endpoint
app.get("/status", (req, res) => {
  res.json({
    connected: isConnected,
    pairingCode: pairingCode || "none",
    hasAuth: fs.existsSync("./auth/creds.json"),
    qrCode: qrCode ? "available" : "none"
  });
});

// Start WhatsApp with QR support
async function startWhatsApp() {
  try {
    console.log("🚀 Starting WhatsApp connection...");
    
    const { state, saveCreds } = await useMultiFileAuthState("./auth");
    
    sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: Browsers.ubuntu("Chrome"),
      logger: { level: "silent" }
    });

    // Initialize command handler
    commandHandler = new CommandHandler(sock);
    console.log("✅ Command handler ready");

    // Save credentials
    sock.ev.on("creds.update", saveCreds);

    // Connection updates
    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrCode = qr;
        console.log("📱 New QR Code generated");
      }

      if (connection === "open") {
        isConnected = true;
        qrCode = null;
        pairingCode = null;
        console.log("✅ WhatsApp connected successfully!");
        
        // Send welcome message
        try {
          if (sock.user?.id) {
            sock.sendMessage(sock.user.id, {
              text: "🤖 *Viral-Bot Mini Started!*\n\nBot is now online and ready!\nUse `.menu` to see all commands."
            });
          }
        } catch (error) {
          console.log("Note: Could not send startup message");
        }
      }

      if (connection === "close") {
        isConnected = false;
        qrCode = null;
        pairingCode = null;
        
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          console.log("🔄 Reconnecting in 10 seconds...");
          setTimeout(() => startWhatsApp(), 10000);
        } else {
          console.log("❌ Logged out. Need new pairing.");
        }
      }
    });

    // Message handler
    sock.ev.on("messages.upsert", async (data) => {
      try {
        const m = data.messages?.[0];
        if (!m?.message || m.key?.fromMe) return;
        
        if (commandHandler) {
          await commandHandler.handleMessage(m);
        }
      } catch (error) {
        console.log("Message handling error:", error.message);
      }
    });

  } catch (error) {
    console.error("Failed to start WhatsApp:", error);
    
    // Retry after delay
    setTimeout(() => {
      console.log("🔄 Retrying connection...");
      startWhatsApp();
    }, 15000);
  }
}

// PAIRING ENDPOINT - FIXED
app.post("/pair", async (req, res) => {
  try {
    let phone = String(req.body.phone || "").trim();
    
    // Basic validation
    if (!phone || phone.length < 10) {
      return res.json({ 
        success: false, 
        error: "Enter a valid phone number (e.g., 2348123456789)" 
      });
    }

    // Clean phone number - remove all non-digits
    phone = phone.replace(/\D/g, '');
    
    // Ensure it starts with country code if Nigerian
    if (phone.length === 10 && phone.startsWith('0')) {
      phone = '234' + phone.substring(1);
    } else if (phone.length === 11 && phone.startsWith('0')) {
      phone = '234' + phone.substring(1);
    }
    
    console.log(`📱 Processing pairing for: ${phone}`);
    
    // Check if we have an active socket
    if (!sock) {
      console.log("Starting fresh WhatsApp instance...");
      await startWhatsApp();
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Wait a bit more if still not ready
    if (!sock) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    if (!sock) {
      return res.json({ 
        success: false, 
        error: "WhatsApp not initialized. Please try again." 
      });
    }
    
    // Check if already registered
    const isRegistered = sock.authState?.creds?.registered;
    
    if (isRegistered) {
      // If already registered, we need to reset
      console.log("Already registered, need to reset first");
      return res.json({ 
        success: false, 
        error: "Bot is already connected. Please reset first." 
      });
    }
    
    // Request pairing code
    console.log("Requesting pairing code...");
    
    try {
      pairingCode = await sock.requestPairingCode(phone);
      console.log(`✅ Pairing code generated: ${pairingCode}`);
      
      if (pairingCode && pairingCode.length === 8) {
        // Format code for display: XXXX-XXXX
        const formattedCode = pairingCode.replace(/(\d{4})(\d{4})/, '$1 $2');
        
        return res.json({ 
          success: true, 
          code: formattedCode,
          rawCode: pairingCode
        });
      } else {
        return res.json({ 
          success: false, 
          error: "Invalid pairing code received. Please try again." 
        });
      }
    } catch (pairError) {
      console.error("Pairing error:", pairError);
      
      // Check specific error
      if (pairError.message?.includes("registered")) {
        return res.json({ 
          success: false, 
          error: "This number is already registered. Please use a different number or reset." 
        });
      } else if (pairError.message?.includes("timeout")) {
        return res.json({ 
          success: false, 
          error: "Request timeout. Please try again." 
        });
      } else {
        return res.json({ 
          success: false, 
          error: "Failed to generate code: " + pairError.message 
        });
      }
    }
    
  } catch (error) {
    console.error("Pair endpoint error:", error);
    return res.json({ 
      success: false, 
      error: "Server error. Please refresh and try again." 
    });
  }
});

// Reset endpoint
app.post("/reset", (req, res) => {
  try {
    console.log("🔄 Resetting bot session...");
    
    // Close existing connection
    if (sock) {
      try {
        sock.end();
      } catch (e) {}
      sock = null;
    }
    
    // Delete auth directory
    if (fs.existsSync("./auth")) {
      fs.rmSync("./auth", { recursive: true, force: true });
      console.log("✅ Auth directory removed");
    }
    
    // Reset state
    pairingCode = null;
    isConnected = false;
    commandHandler = null;
    qrCode = null;
    
    // Restart fresh
    setTimeout(() => startWhatsApp(), 2000);
    
    res.json({ 
      success: true, 
      message: "Session reset successfully. You can now pair again." 
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Get QR code for pairing
app.get("/qr", (req, res) => {
  if (qrCode) {
    res.json({ success: true, qr: qrCode });
  } else {
    res.json({ success: false, message: "No QR available" });
  }
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Web interface available`);
  
  // Check for existing session
  const hasSession = fs.existsSync("./auth/creds.json");
  
  if (hasSession) {
    console.log("🔑 Found existing session, restoring...");
    setTimeout(() => startWhatsApp(), 2000);
  } else {
    console.log("📱 No existing session. Ready for pairing.");
  }
});

// Keep Render alive
setInterval(() => {
  console.log("💓 Keep-alive ping");
}, 300000); // 5 minutes