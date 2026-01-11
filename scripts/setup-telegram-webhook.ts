import { readFileSync } from 'fs';
import { join } from 'path';

// Read .env file manually
const envPath = join(process.cwd(), '.env');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = Object.fromEntries(
    envContent
        .split('\n')
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
            const [key, ...valueParts] = line.split('=');
            return [key.trim(), valueParts.join('=').trim()];
        })
);

const TELEGRAM_BOT_TOKEN = envVars.TELEGRAM_EXPENSE_BOT_TOKEN;
const WEBHOOK_URL = 'https://duitmyself.obliquetitan.com/webhook/telegram';

if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ Error: TELEGRAM_EXPENSE_BOT_TOKEN not found in .env');
    process.exit(1);
}

const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

console.log('🔧 Configuring Telegram webhook...\n');

// Get current webhook info
console.log('📊 Current webhook configuration:');
const currentInfo = await fetch(`${telegramApiUrl}/getWebhookInfo`);
const current = await currentInfo.json();
console.log(JSON.stringify(current.result, null, 2));
console.log('\n' + '='.repeat(60) + '\n');

// Set webhook with callback_query support
console.log('⚙️  Setting webhook with allowed_updates...');
const webhookConfig = {
    url: WEBHOOK_URL,
    allowed_updates: ['message', 'callback_query', 'edited_message'],
};

const response = await fetch(`${telegramApiUrl}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookConfig),
});

const result = await response.json();

if (result.ok) {
    console.log('✅ Webhook configured successfully!\n');

    // Verify new config
    console.log('📋 New webhook configuration:');
    const newInfo = await fetch(`${telegramApiUrl}/getWebhookInfo`);
    const newConfig = await newInfo.json();
    console.log(JSON.stringify(newConfig.result, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('✨ Done! Buttons should work now.');
    console.log('💡 Test: Send a screenshot and click Confirm/Edit/Cancel\n');
} else {
    console.error('❌ Failed to set webhook:');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
}
