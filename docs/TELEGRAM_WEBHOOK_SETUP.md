# Telegram Webhook Setup

## Problem
Telegram buttons (Confirm, Edit, Cancel) don't work because the webhook is not configured to receive `callback_query` updates.

## Root Cause
By default, Telegram webhooks don't send all update types. You must explicitly specify which update types you want to receive using the `allowed_updates` parameter when calling `setWebhook`.

## Solution
Run the setup script to configure the webhook with the correct `allowed_updates`:

```bash
# From project root
node scripts/setup-telegram-webhook.js
```

## What the Script Does
1. Gets current webhook configuration
2. Sets webhook with `allowed_updates` including:
   - `message` - Regular text messages
   - `callback_query` - **Button clicks (THIS IS THE FIX!)**
   - `edited_message` - Edited messages
3. Verifies the new configuration

## Manual Setup (Alternative)
If you prefer to do it manually, use this curl command:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://duitmyself.obliquetitan.com/webhook/telegram",
    "allowed_updates": ["message", "callback_query", "edited_message"]
  }'
```

Replace `<YOUR_BOT_TOKEN>` with your actual bot token.

## Verification
After running the script, you should see:
- ✅ Webhook URL set correctly
- ✅ `allowed_updates` includes `callback_query`
- ✅ No pending errors

## Testing
1. Send a fresh screenshot via MacroDroid
2. Click the **Confirm**, **Edit**, or **Cancel** button
3. Check Dokploy logs - you should now see:
   - `telegram.callback.detected` - Button click received!
   - `telegram.callback.handling` - Processing the click
   - `telegram.callback.success` - Successfully handled

## References
- [Telegram Bot API - setWebhook](https://core.telegram.org/bots/api#setwebhook)
- [Telegram Bot API - allowed_updates](https://core.telegram.org/bots/api#getupdates)
