# HTTP Test Files

This directory contains HTTP request files organized by service/feature.

## Files

- **`health.http`** - Health check and metrics endpoints
- **`expense-tracker.http`** - Expense tracker webhook tests (banking notifications)
- **`cc-statements.http`** - CC statement job triggers

## Usage

### VS Code REST Client Extension

1. Install the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension
2. Open any `.http` file
3. Click "Send Request" above any request

### IntelliJ/WebStorm

1. Open any `.http` file
2. Click the green play button next to the request

### curl

Copy the request details and use curl:
```bash
curl -X POST http://localhost:3001/jobs/cc-statements
```

## Port Configuration

- **Local**: Port 3001 (or set via `PORT` env var)
- **Production**: https://duitmyself.obliquetitan.com

## Notes

- Local requests use `http://localhost:3001`
- Production requests use `https://duitmyself.obliquetitan.com`
- All requests are separated by `###` markers
