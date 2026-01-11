# Debugging Telegram Button Issues

## Quick Fix: Try This First

**Most likely issue:** Conversation state was lost (server restart clears memory).

**Solution:** Send a fresh screenshot, then immediately click Confirm.

## If That Doesn't Work

Share Dokploy logs after clicking a button. Look for:
- `telegram.webhook.received` with `hasCallback: true`
- `telegram.callback.received`
- Any error messages

This will show exactly what's failing.
