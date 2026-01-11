# MacroDroid Integration Guide

## Overview

This guide shows you how to configure MacroDroid to automatically send transaction screenshots to your Telegram bot for processing.

---

## Prerequisites

- ✅ MacroDroid app installed on Android
- ✅ Telegram bot created and configured (see `TELEGRAM_SETUP.md`)
- ✅ DuitMyself server deployed and running
- ✅ Telegram webhook set up

---

## MacroDroid Macro Setup

### Step 1: Create New Macro

1. Open MacroDroid app
2. Tap the **+** button to create a new macro
3. Name it: **"Expense Tracker - Screenshot"**

---

### Step 2: Add Trigger

**Option A: Manual Button (Recommended for testing)**

1. Tap **Add Trigger**
2. Select **Shortcut Launched**
3. Choose **Create New Shortcut**
4. Name it: **"Track Expense"**
5. This creates a home screen button you can tap after taking a screenshot

**Option B: Automatic Screenshot Detection**

1. Tap **Add Trigger**
2. Select **Screen Capture**
3. This will trigger automatically whenever you take a screenshot
4. ⚠️ **Warning**: This will trigger for ALL screenshots, not just transactions

**Option C: Notification Trigger (Advanced)**

1. Tap **Add Trigger**
2. Select **Notification**
3. Choose specific banking apps (e.g., "Maybank", "TNG", "Grab")
4. This triggers when you receive a transaction notification

---

### Step 3: Add Actions

#### Action 1: Get Screenshot

1. Tap **Add Action**
2. Go to **Screen** → **Take Screenshot**
3. Configure:
   - **Save to**: Memory (don't save to gallery)
   - **Quality**: 80% (good balance)

**OR** if using Option C (Notification Trigger):
1. Skip screenshot action
2. The notification itself will be processed

#### Action 2: Get GPS Location (Optional)

1. Tap **Add Action**
2. Go to **Location** → **Get Location**
3. Configure:
   - **Accuracy**: Medium
   - **Timeout**: 5 seconds
   - **Store in**: Local variable `{lv=gps_lat}` and `{lv=gps_lon}`

#### Action 3: HTTP POST to Server

1. Tap **Add Action**
2. Go to **Connectivity** → **HTTP Request**
3. Configure:

**URL:**
```
https://your-domain.com/webhook/telegram/screenshot
```
Replace `your-domain.com` with your actual domain (e.g., `duitmyself.obliquetitan.com`)

**Method:** `POST`

**Content Type:** `application/json`

**Request Body:**
```json
{
  "chat_id": YOUR_CHAT_ID,
  "image_base64": "{base64=last_screenshot}",
  "app_package_name": "{foreground_app_package}",
  "latitude": "{lv=gps_lat}",
  "longitude": "{lv=gps_lon}",
  "timestamp": "{datetime_iso}"
}
```

**Replace `YOUR_CHAT_ID`** with your actual Telegram chat ID (e.g., `1053248458`)

**Macros to use:**
- `{base64=last_screenshot}` - Base64-encoded screenshot
- `{foreground_app_package}` - App package name (e.g., `com.maybank2u.life`)
- `{lv=gps_lat}` - GPS latitude (from Action 2)
- `{lv=gps_lon}` - GPS longitude (from Action 2)
- `{datetime_iso}` - Current timestamp in ISO format

**Headers:**
```
Content-Type: application/json
```

**Timeout:** 30 seconds

**Store Response In:** (Optional) `{lv=response}` for debugging

---

### Step 4: Add Confirmation (Optional)

1. Tap **Add Action**
2. Go to **User Interface** → **Toast**
3. Configure:
   - **Message**: "Expense sent to Telegram bot!"
   - **Duration**: Short

---

## Example Macro Configuration

### Trigger
- **Shortcut Launched**: "Track Expense"

### Actions
1. **Take Screenshot** (Quality: 80%)
2. **Get Location** (Medium accuracy, 5s timeout)
3. **HTTP Request**:
   - URL: `https://duitmyself.obliquetitan.com/webhook/telegram/screenshot`
   - Method: POST
   - Body: (see JSON above)
4. **Toast**: "Expense sent!"

---

## Testing the Macro

### Test 1: Manual Test

1. Open a banking app (e.g., Maybank)
2. Navigate to a transaction screen
3. Tap your **"Track Expense"** shortcut
4. MacroDroid will:
   - Take a screenshot
   - Get your location
   - Send to server
5. Check Telegram - you should see the bot analyzing the screenshot

### Test 2: End-to-End Flow

1. Make a real transaction (or open a past transaction)
2. Trigger the macro
3. In Telegram, you should see:
   ```
   🔄 Analyzing screenshot...
   
   💰 Amount: RM 45.50
   🏪 Merchant: Starbucks
   📂 Which account is this from?
   
   [🏦 Maybank] [💰 TNG]
   [🚗 Grab] [🛍️ Shopee]
   ```
4. Select the account
5. Confirm the transaction
6. Verify it appears in Lunch Money

---

## Troubleshooting

### Bot doesn't respond

**Check:**
- ✅ Server is running (`curl https://your-domain.com/health`)
- ✅ Telegram webhook is set (`curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`)
- ✅ Chat ID is correct in MacroDroid
- ✅ Check server logs for errors

**Test webhook manually:**
```bash
curl -X POST https://your-domain.com/webhook/telegram/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": YOUR_CHAT_ID,
    "image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "app_package_name": "com.maybank2u.life",
    "timestamp": "2026-01-11T20:00:00Z"
  }'
```

### Screenshot not captured

**Check:**
- ✅ MacroDroid has screenshot permission
- ✅ Screenshot action is before HTTP request
- ✅ Using `{base64=last_screenshot}` macro correctly

### GPS not working

**Check:**
- ✅ Location permission granted to MacroDroid
- ✅ GPS is enabled on phone
- ✅ Timeout is long enough (try 10 seconds)

**Note:** GPS is optional - the bot will work without it

### Wrong app detected

**Check:**
- ✅ Using `{foreground_app_package}` macro
- ✅ Banking app is in foreground when screenshot is taken
- ✅ App package name is in `account-mapping.json`

---

## Advanced: Automatic Notification Processing

Instead of screenshots, you can send notification text directly:

### Macro for Notification Text

**Trigger:** Notification from banking app

**Actions:**
1. **HTTP Request**:
   ```json
   {
     "chat_id": YOUR_CHAT_ID,
     "notification_text": "{notification_text}",
     "app_package_name": "{notification_app_package}",
     "timestamp": "{datetime_iso}"
   }
   ```

**Note:** This requires a different webhook endpoint (not yet implemented)

---

## Tips & Best Practices

### 1. **Test with Old Transactions First**
- Open past transactions in your banking app
- Test the macro before using on real-time transactions

### 2. **Use Shortcut for Control**
- Manual shortcut gives you control over when to send
- Prevents accidental triggers

### 3. **Check Response**
- Store HTTP response in variable
- Add a "Flash" action to show response
- Helps debug issues

### 4. **Battery Optimization**
- Disable battery optimization for MacroDroid
- Ensures macros run reliably

### 5. **Network Check**
- Add a constraint: "WiFi Connected" or "Mobile Data Connected"
- Prevents failures when offline

---

## Example: Full Macro with Error Handling

```
Trigger: Shortcut "Track Expense"

Constraints:
  - WiFi Connected OR Mobile Data Connected

Actions:
  1. Take Screenshot (80% quality)
  2. Get Location (Medium, 5s timeout)
  3. HTTP Request
     - URL: https://duitmyself.obliquetitan.com/webhook/telegram/screenshot
     - Method: POST
     - Body: {...}
     - Store response in: {lv=response}
  4. IF {lv=response} contains "success"
       THEN: Toast "✅ Sent to Telegram!"
       ELSE: Toast "❌ Failed: {lv=response}"
```

---

## Security Notes

- ✅ **HTTPS only** - Never use HTTP for the webhook
- ✅ **Chat ID is personal** - Only you can send to your bot
- ✅ **No sensitive data in logs** - MacroDroid logs are local
- ✅ **Server validates requests** - Invalid requests are rejected

---

## Next Steps

Once your macro is working:
1. Create shortcuts for different transaction types
2. Set up automatic triggers for specific apps
3. Customize the response messages
4. Add more banking apps to `account-mapping.json`

---

## Support

If you encounter issues:
1. Check server logs: `docker logs duitmyself-app`
2. Check Telegram webhook: `getWebhookInfo` API
3. Test with curl command (see Troubleshooting)
4. Review MacroDroid logs in the app

Happy expense tracking! 🎉
