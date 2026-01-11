@echo off
REM Telegram Webhook Setup Script for Windows
REM This configures the webhook to receive callback_query updates (button clicks)

SET WEBHOOK_URL=https://duitmyself.obliquetitan.com/webhook/telegram

echo.
echo ========================================
echo Telegram Webhook Configuration Tool
echo ========================================
echo.

REM Check if token is provided
if "%TELEGRAM_EXPENSE_BOT_TOKEN%"=="" (
    echo ERROR: TELEGRAM_EXPENSE_BOT_TOKEN environment variable is not set
    echo.
    echo Please set it first:
    echo   set TELEGRAM_EXPENSE_BOT_TOKEN=your_bot_token_here
    echo.
    echo Or run this script from a terminal where the .env file is loaded
    exit /b 1
)

SET API_URL=https://api.telegram.org/bot%TELEGRAM_EXPENSE_BOT_TOKEN%

echo Getting current webhook info...
echo.
curl -s "%API_URL%/getWebhookInfo" | jq .
echo.
echo ========================================
echo.
echo Setting webhook with allowed_updates...
echo.

REM Set webhook with callback_query support
curl -X POST "%API_URL%/setWebhook" ^
  -H "Content-Type: application/json" ^
  -d "{\"url\":\"%WEBHOOK_URL%\",\"allowed_updates\":[\"message\",\"callback_query\",\"edited_message\"]}"

echo.
echo.
echo ========================================
echo.
echo Verifying new configuration...
echo.
curl -s "%API_URL%/getWebhookInfo" | jq .
echo.
echo ========================================
echo.
echo Done! If you see "callback_query" in allowed_updates above, the fix is applied.
echo Now test by sending a screenshot and clicking the buttons!
echo.
