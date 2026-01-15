// server.js - ACCEPTS ALL COUNTRIES
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
    hasAuth: fs.existsSync("./auth/creds.json")
  });
});

// Start WhatsApp
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
      const { connection, lastDisconnect } = update;
      
      if (connection === "open") {
        isConnected = true;
        pairingCode = null;
        console.log("✅ WhatsApp connected successfully!");
        
        // Send welcome message
        try {
          if (sock.user?.id) {
            sock.sendMessage(sock.user.id, {
              text: "🤖 *Viral-Bot Mini Started!*\n\nBot is now online and ready!\nUse `.menu` to see all commands.\n\n📢 *Channel:* https://whatsapp.com/channel/0029VbCGIzTJkK7C0wtGy31s"
            });
          }
        } catch (error) {
          console.log("Note: Could not send startup message");
        }
      }

      if (connection === "close") {
        isConnected = false;
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

// PAIRING ENDPOINT - ACCEPTS ALL COUNTRIES
app.post("/pair", async (req, res) => {
  try {
    let phone = String(req.body.phone || "").trim();
    
    // Basic validation
    if (!phone || phone.length < 8) {
      return res.json({ 
        success: false, 
        error: "Enter a valid phone number (e.g., 14155551234, 919876543210, 447912345678)" 
      });
    }

    // Clean phone number - remove all non-digits
    phone = phone.replace(/\D/g, '');
    
    console.log(`📱 Processing pairing for: +${phone}`);
    
    // Check length - WhatsApp numbers are typically 8-15 digits including country code
    if (phone.length < 8 || phone.length > 15) {
      return res.json({ 
        success: false, 
        error: `Phone number should be 8-15 digits. You entered ${phone.length} digits.` 
      });
    }
    
    // Check if we have an active socket
    if (!sock) {
      console.log("Starting fresh WhatsApp instance...");
      await startWhatsApp();
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 3000));
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
        error: "Bot is already connected. Please use /reset-page first." 
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
          rawCode: pairingCode,
          countryCode: phone.substring(0, 3),
          fullNumber: phone
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
      } else if (pairError.message?.includes("code")) {
        return res.json({ 
          success: false, 
          error: "WhatsApp rejected the request. Please verify your phone number format." 
        });
      } else {
        return res.json({ 
          success: false, 
          error: "Failed to generate code. Please try with a different number." 
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

// Reset page
app.get("/reset-page", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Reset Bot Session</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
        button { padding: 15px 30px; background: #dc3545; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; }
        button:hover { background: #c82333; }
        #result { margin-top: 20px; padding: 15px; border-radius: 8px; display: none; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .back { display: block; margin-top: 20px; color: #667eea; }
      </style>
    </head>
    <body>
      <h1>Reset Bot Session</h1>
      <p>Use this if pairing fails or you want to connect with a different number</p>
      <button onclick="resetSession()">Reset Session</button>
      <a href="/" class="back">← Back to Pairing</a>
      <div id="result"></div>
      <script>
        async function resetSession() {
          const result = document.getElementById('result');
          result.style.display = 'none';
          
          try {
            const response = await fetch('/reset', { method: 'POST' });
            const data = await response.json();
            
            result.textContent = data.message || (data.success ? 'Success!' : 'Failed');
            result.className = data.success ? 'success' : 'error';
            result.style.display = 'block';
            
            if (data.success) {
              setTimeout(() => {
                window.location.href = '/';
              }, 2000);
            }
          } catch (error) {
            result.textContent = 'Error: ' + error.message;
            result.className = 'error';
            result.style.display = 'block';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Country codes info
app.get("/country-codes", (req, res) => {
  res.json({
    common_codes: [
      { country: "USA/Canada", code: "1", example: "15551234567" },
      { country: "UK", code: "44", example: "447912345678" },
      { country: "India", code: "91", example: "919876543210" },
      { country: "Nigeria", code: "234", example: "2348123456789" },
      { country: "Kenya", code: "254", example: "254712345678" },
      { country: "Ghana", code: "233", example: "233501234567" },
      { country: "South Africa", code: "27", example: "27711234567" },
      { country: "Egypt", code: "20", example: "201012345678" },
      { country: "Pakistan", code: "92", example: "923001234567" },
      { country: "Indonesia", code: "62", example: "62812345678" },
      { country: "Philippines", code: "63", example: "639171234567" },
      { country: "Brazil", code: "55", example: "5511991234567" },
      { country: "Mexico", code: "52", example: "5215512345678" }
    ],
    instructions: "Enter your FULL phone number including country code. Remove any leading zeros."
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Web interface available worldwide`);
  console.log(`📱 Supports all country codes`);
  
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
  if (isConnected) {
    console.log("💓 Heartbeat: Bot is alive");
  }
}, 300000); // 5 minutes