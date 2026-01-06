# Screenshot to Base64 Converter
# Usage: .\convert-screenshot.ps1 path\to\screenshot.png

param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath
)

if (-not (Test-Path $ImagePath)) {
    Write-Error "Image file not found: $ImagePath"
    exit 1
}

Write-Host "Converting image to base64..." -ForegroundColor Cyan

# Read image and convert to base64
$bytes = [System.IO.File]::ReadAllBytes($ImagePath)
$base64 = [System.Convert]::ToBase64String($bytes)

# Create .env file
$envContent = "SHOPEEPAY_SCREENSHOT_BASE64=$base64"
$envPath = Join-Path $PSScriptRoot ".env"

$envContent | Out-File -FilePath $envPath -Encoding ASCII -NoNewline

Write-Host "Base64 string saved to .env file" -ForegroundColor Green
Write-Host "File: $envPath" -ForegroundColor Gray
Write-Host "Size: $($base64.Length) characters" -ForegroundColor Gray
Write-Host ""
Write-Host "You can now use the webhook-tests.http file to test the screenshot endpoint." -ForegroundColor Yellow
