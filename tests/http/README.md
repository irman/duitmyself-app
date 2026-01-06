# Screenshot Webhook Testing

This directory contains test files for the webhook endpoints.

## Files

- `webhook-tests.http` - HTTP test requests for both notification and screenshot webhooks
- `notification.json` - Example notification payload from MacroDroid
- `mdr.json` - MacroDroid configuration export

## Testing Screenshot Webhook

### Setup

1. Create a `.env` file in the `playground` directory:
```bash
SHOPEEPAY_SCREENSHOT_BASE64=<your_base64_encoded_screenshot>
```

2. To convert a screenshot to base64 (PowerShell):
```powershell
# Convert image to base64
$bytes = [System.IO.File]::ReadAllBytes("path\to\screenshot.png")
$base64 = [System.Convert]::ToBase64String($bytes)
$base64 | Out-File -FilePath ".env" -Encoding ASCII
```

Or use the provided script:
```powershell
.\convert-screenshot.ps1 path\to\screenshot.png
```

### Running Tests

Use the REST Client extension in VS Code to run the requests in `webhook-tests.http`.

## Example Payloads

### Screenshot Webhook
```json
{
  "image_base64": "<base64_string>",
  "app_package_name": "com.shopeepay.my",
  "timestamp": "2026-01-06T13:17:00Z",
  "latitude": "3.1390",
  "longitude": "101.6869",
  "metadata": {
    "device": "Samsung Galaxy",
    "screen_title": "Payment Successful"
  }
}
```

### Notification Webhook
```json
{
  "app": "com.shopeepay.my",
  "title": "Payment Successful",
  "text": "You paid RM1.50 to FP-AEON",
  "timestamp": "1736150220000",
  "latitude": "3.1390",
  "longitude": "101.6869"
}
```

## Expected Response

Both webhooks return:
```json
{
  "success": true,
  "message": "Screenshot/Notification webhook received, processing transaction"
}
```

Processing happens asynchronously in the background.
