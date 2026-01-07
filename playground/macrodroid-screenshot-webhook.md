# MacroDroid Screenshot Webhook Configuration

## Problem
MacroDroid's string variables have character length limits that prevent storing large base64-encoded images. A typical screenshot generates a massive base64 string that exceeds MacroDroid's variable size limits.

## Solution: Use Shell Script with curl

Instead of using the HTTP Request action, use the **Shell Script** action with `curl` to directly upload the file.

## MacroDroid Configuration

### ✅ Recommended Setup (Separate Actions)

This approach keeps upload and deletion as separate actions, allowing for conditional logic in the future.

#### **Action 1: Upload Screenshot**

**Shell Script** (no root required):

```bash
CACHE_DIR="/storage/emulated/0/MacroDroid" && base64 -w 0 {file_path} > "$CACHE_DIR/img.b64" && echo '{"image_base64":"'$(cat "$CACHE_DIR/img.b64")'","app_package_name":"{v=transAppName}","timestamp":"'$(date +%s)'","latitude":"{last_loc_lat}","longitude":"{last_loc_long}","metadata":{}}' > "$CACHE_DIR/payload.json" && curl -X POST https://duitmyself.obliquetitan.com/webhook/screenshot -H "Content-Type: application/json" -d @"$CACHE_DIR/payload.json" && rm "$CACHE_DIR/img.b64" "$CACHE_DIR/payload.json"
```

**How it works:**
- Converts screenshot to base64 → `img.b64`
- Creates JSON payload file → `payload.json` (avoids "Argument list too long")
- Sends via `curl -d @payload.json` (reads from file, not command line)
- Cleans up both temp files

**Why this fixes the error:**
- Large screenshots create huge base64 strings
- Passing huge strings as `-d 'data'` hits shell argument limits
- Using `-d @file` reads from file, bypassing the limit

#### **Action 2: Delete Screenshot**

**Shell Script** (no root required):

```bash
rm "{file_path}"
```

**Why separate actions?**
- ✅ Easier to add conditions (e.g., only delete if webhook returns success)
- ✅ Can disable deletion for debugging without editing the upload script
- ✅ Cleaner macro flow
- ✅ Can add logic between upload and delete (e.g., check response, add delays)

---

### Alternative: Combined Script (Upload + Auto-Delete)

If you want everything in one action:

```bash
CACHE_DIR="/storage/emulated/0/MacroDroid" && SCREENSHOT="{file_path}" && base64 -w 0 "$SCREENSHOT" > "$CACHE_DIR/img.b64" && echo '{"image_base64":"'$(cat "$CACHE_DIR/img.b64")'","app_package_name":"{v=transAppName}","timestamp":"'$(date +%s)'","latitude":"{last_loc_lat}","longitude":"{last_loc_long}","metadata":{}}' > "$CACHE_DIR/payload.json" && curl -X POST https://duitmyself.obliquetitan.com/webhook/screenshot -H "Content-Type: application/json" -d @"$CACHE_DIR/payload.json" && rm "$CACHE_DIR/img.b64" "$CACHE_DIR/payload.json" "$SCREENSHOT"
```

## Complete Macro Flow

### Recommended Setup:

1. **Trigger**: File Created/Modified in Screenshots folder
2. **Action 1**: Set Variable `transAppName` = `{fg_app_package}`
3. **Action 2**: Wait 1 second (let screenshot finish writing)
4. **Action 3**: Shell Script - Upload screenshot (see script above)
5. **Action 4**: Shell Script - Delete screenshot: `rm "{file_path}"`
6. **Action 5** (Optional): Show notification "Transaction captured"

### Future Enhancements:

You can add conditions between Action 4 and 5:
- Check if webhook returned success
- Only delete for specific apps
- Keep screenshots for certain transaction types
- Add a delay before deletion

## Important Notes

- The `base64 -w 0` flag ensures no line wrapping (single line output)
- MacroDroid will substitute `{file_path}`, `{v=transAppName}`, etc. before running the script
- The timestamp is generated at runtime using `date +%s` (Unix seconds)
- No root access required for this script

## Testing

Test the shell script in MacroDroid by:
1. Taking a screenshot manually
2. Checking MacroDroid logs for any errors
3. Verifying the webhook receives the request in your server logs

## Troubleshooting

### "Argument list too long" Error
This happens when trying to pass large base64 strings as command-line arguments. **Solution**: Use the temp file approach shown above.

### "Operation not permitted" on /sdcard/
Some Android devices restrict writing to `/sdcard/`. **Solution**: Use `/data/local/tmp/` instead (shown in the updated script above).

### "inaccessible or not found" Errors
This usually indicates line ending issues (Windows CRLF vs Unix LF) or multi-line script parsing problems in MacroDroid. **Solution**: Use the single-line version provided above.

### Other Issues
- Check MacroDroid logs for error messages
- Verify `curl` and `base64` commands are available
- Test with a smaller screenshot first
- Check network connectivity
- Make sure the script is entered as a single continuous line in MacroDroid
