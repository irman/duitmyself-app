# Telegram Bot Setup Guide

## Prerequisites

Before the Telegram bot integration can work, you need to:

1. **Create a Telegram Bot**
2. **Get your Telegram Chat ID**
3. **Add credentials to `.env`**

---

## Step 1: Create a Telegram Bot

### 1.1 Open Telegram and find BotFather

- Open Telegram app (mobile or desktop)
- Search for `@BotFather` (official bot with blue checkmark)
- Start a chat with BotFather

### 1.2 Create a new bot

Send this command to BotFather:
```
/newbot
```

BotFather will ask for:

1. **Bot name** (display name, can be anything)
   - Example: `DuitMyself Expense Tracker`

2. **Bot username** (must end with `bot`, must be unique)
   - Example: `duitmyself_expense_bot`

### 1.3 Save your Bot Token

BotFather will respond with:
```
Done! Congratulations on your new bot...
Use this token to access the HTTP API:
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890

Keep your token secure and store it safely...
```

**⚠️ IMPORTANT**: Copy this token! You'll need it for `.env`

---

## Step 2: Get Your Telegram Chat ID

### Option A: Using a Bot (Easiest)

1. Search for `@userinfobot` in Telegram
2. Start a chat and send any message
3. The bot will reply with your user info including `Id: 123456789`
4. Copy this number - this is your Chat ID

### Option B: Using the API

1. Send a message to your newly created bot (the one you just made with BotFather)
2. Open this URL in your browser (replace `YOUR_BOT_TOKEN` with your actual token):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
3. Look for `"chat":{"id":123456789}` in the JSON response
4. Copy the `id` number - this is your Chat ID

---

## Step 3: Add to Environment Variables

### 3.1 Update `.env` file

Add these lines to your `.env` file:

```bash
# Telegram Bot (Expense Tracker)
TELEGRAM_EXPENSE_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890
TELEGRAM_EXPENSE_CHAT_ID=123456789
```

Replace with your actual values:
- `TELEGRAM_EXPENSE_BOT_TOKEN`: The token from BotFather
- `TELEGRAM_EXPENSE_CHAT_ID`: Your chat ID from Step 2

### 3.2 Verify `.env.example` (already done)

The `.env.example` file already has these placeholders:
```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_chat_id_here
```

---

## Step 4: Set Telegram Webhook (After Deployment)

Once the code is deployed and running, you need to tell Telegram where to send updates.

### Option A: Using curl (Recommended)

Run this command (replace values):
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/webhook/telegram"}'
```

Example:
```bash
curl -X POST "https://api.telegram.org/bot1234567890:ABCdef/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://duitmyself.example.com/webhook/telegram"}'
```

### Option B: Using browser

Open this URL in your browser (replace values):
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-domain.com/webhook/telegram
```

### Verify webhook is set

Check webhook status:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

You should see:
```json
{
  "ok": true,
  "result": {
    "url": "https://your-domain.com/webhook/telegram",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

---

## Step 5: Test the Bot

### 5.1 Send a test message

1. Open Telegram
2. Search for your bot username (e.g., `@duitmyself_expense_bot`)
3. Start a chat and send `/start`

The bot should respond (once we implement the webhook handler).

### 5.2 Test with screenshot (after full implementation)

1. Take a screenshot of a transaction
2. Send it to your bot
3. Bot should analyze it and ask for confirmation

---

## Summary Checklist

Before continuing with implementation, make sure you have:

- [ ] Created a Telegram bot via @BotFather
- [ ] Saved the bot token
- [ ] Found your Telegram chat ID
- [ ] Added both to `.env` file
- [ ] (After deployment) Set the webhook URL

---

## Notes

### Security

- ✅ **Bot token is sensitive** - Never commit it to git
- ✅ **Chat ID is personal** - Only you can send messages to your bot
- ✅ **Webhook URL should use HTTPS** - Telegram requires SSL

### Multiple Users (Future)

Currently, the bot is configured for single-user (your chat ID only). To support multiple users:
1. Remove the chat ID restriction
2. Add user authentication
3. Store user preferences per chat ID

### Troubleshooting

**Bot doesn't respond:**
- Check webhook is set correctly (`getWebhookInfo`)
- Check server logs for errors
- Verify bot token is correct in `.env`

**Webhook fails:**
- Ensure URL is HTTPS (Telegram requirement)
- Check Cloudflare Tunnel is running
- Verify Dokploy is routing correctly

---

## What's Next?

Once you've completed Steps 1-3 above:
1. I'll continue implementing the conversation handler
2. We'll deploy to Dokploy
3. You'll set the webhook (Step 4)
4. We can test the full flow!

Let me know when you're ready to proceed!
