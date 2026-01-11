# Quick Fix: Telegram Webhook Configuration

## The Problem
Your buttons don't work because Telegram isn't sending callback queries to your webhook.

## The Fix (Choose One)

### Option 1: Quick curl command (Easiest)
Open PowerShell and run:

```powershell
# Replace YOUR_BOT_TOKEN with your actual token
$token = "YOUR_BOT_TOKEN"
$url = "https://duitmyself.obliquetitan.com/webhook/telegram"

Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{
    url = $url
    allowed_updates = @("message", "callback_query", "edited_message")
  } | ConvertTo-Json)
```

### Option 2: Using curl
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://duitmyself.obliquetitan.com/webhook/telegram","allowed_updates":["message","callback_query","edited_message"]}'
```

### Option 3: Use the batch script
```cmd
set TELEGRAM_EXPENSE_BOT_TOKEN=your_token_here
scripts\setup-telegram-webhook.bat
```

## Verify It Worked
Check the webhook info:
```powershell
$token = "YOUR_BOT_TOKEN"
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo"
```

Look for `"allowed_updates": ["message", "callback_query", "edited_message"]`

## Test
1. Send a fresh screenshot
2. Click Confirm/Edit/Cancel
3. It should work now!
