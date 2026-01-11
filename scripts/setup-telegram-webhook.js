#!/usr/bin/env node

/**
 * Script to configure Telegram webhook with proper allowed_updates
 * 
 * This fixes the issue where callback queries (button clicks) are not being sent to the webhook.
 * By default, Telegram doesn't send callback_query updates unless explicitly specified.
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_EXPENSE_BOT_TOKEN;
const WEBHOOK_URL = 'https://duitmyself.obliquetitan.com/webhook/telegram';

if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ Error: TELEGRAM_EXPENSE_BOT_TOKEN environment variable is not set');
    process.exit(1);
}

const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function setWebhook() {
    console.log('🔧 Configuring Telegram webhook...\n');

    const webhookConfig = {
        url: WEBHOOK_URL,
        allowed_updates: [
            'message',           // Regular messages
            'callback_query',    // Button clicks (THIS IS THE FIX!)
            'edited_message',    // Edited messages
        ],
        drop_pending_updates: false, // Keep pending updates
    };

    console.log('Webhook configuration:');
    console.log(JSON.stringify(webhookConfig, null, 2));
    console.log('');

    try {
        const response = await fetch(`${telegramApiUrl}/setWebhook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(webhookConfig),
        });

        const result = await response.json();

        if (result.ok) {
            console.log('✅ Webhook configured successfully!');
            console.log('');

            // Get webhook info to verify
            const infoResponse = await fetch(`${telegramApiUrl}/getWebhookInfo`);
            const info = await infoResponse.json();

            if (info.ok) {
                console.log('📋 Current webhook status:');
                console.log(`   URL: ${info.result.url}`);
                console.log(`   Allowed updates: ${JSON.stringify(info.result.allowed_updates)}`);
                console.log(`   Pending update count: ${info.result.pending_update_count}`);
                console.log(`   Last error: ${info.result.last_error_message || 'None'}`);
                console.log(`   Last error date: ${info.result.last_error_date ? new Date(info.result.last_error_date * 1000).toISOString() : 'N/A'}`);
            }
        } else {
            console.error('❌ Failed to set webhook:');
            console.error(JSON.stringify(result, null, 2));
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error setting webhook:', error.message);
        process.exit(1);
    }
}

async function getWebhookInfo() {
    console.log('\n📊 Getting current webhook info...\n');

    try {
        const response = await fetch(`${telegramApiUrl}/getWebhookInfo`);
        const result = await response.json();

        if (result.ok) {
            console.log('Current webhook configuration:');
            console.log(JSON.stringify(result.result, null, 2));
        } else {
            console.error('Failed to get webhook info:', result);
        }
    } catch (error) {
        console.error('Error getting webhook info:', error.message);
    }
}

// Main execution
(async () => {
    console.log('🤖 Telegram Webhook Configuration Tool\n');
    console.log('='.repeat(60));

    // Show current config first
    await getWebhookInfo();

    console.log('\n' + '='.repeat(60));

    // Set new config
    await setWebhook();

    console.log('\n' + '='.repeat(60));
    console.log('\n✨ Done! Your bot should now receive callback queries.');
    console.log('💡 Test by sending a screenshot and clicking the buttons.\n');
})();
