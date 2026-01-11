# Dokploy Environment Variables Setup

## Issue
The Telegram bot is disabled because environment variables are missing in Dokploy.

## Required Environment Variables

Add these to your Dokploy app configuration:

```bash
TELEGRAM_EXPENSE_BOT_TOKEN=<your_bot_token_from_botfather>
TELEGRAM_EXPENSE_CHAT_ID=<your_chat_id>
```

## Steps to Add in Dokploy

1. **Open Dokploy Dashboard**
   - Go to https://dokploy.obliquetitan.com (or your Dokploy URL)

2. **Select Your App**
   - Click on `duitmyself` app

3. **Go to Environment Variables**
   - Click on **Settings** or **Environment** tab
   - Look for "Environment Variables" section

4. **Add Variables**
   - Click "Add Variable" or similar button
   - Add:
     - Key: `TELEGRAM_EXPENSE_BOT_TOKEN`
     - Value: Your bot token (from BotFather)
   - Add:
     - Key: `TELEGRAM_EXPENSE_CHAT_ID`
     - Value: Your chat ID (e.g., `1053248458`)

5. **Save and Redeploy**
   - Click Save
   - Trigger a redeploy (or it may redeploy automatically)

## Verification

After redeployment, check the logs. You should see:
```
Telegram Expense Bot initialized successfully
```

Instead of:
```
Telegram Expense Bot disabled - missing TELEGRAM_EXPENSE_BOT_TOKEN or TELEGRAM_EXPENSE_CHAT_ID
```

## Then Test

Once deployed with env vars:
1. Send `/start` to your bot in Telegram
2. Should get welcome message
3. Webhook will work properly
