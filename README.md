# 💰 duitmyself

> **Automate your financial workflows** - Process banking notifications, manage credit card statements, and sync to budgeting platforms automatically.

**duitmyself** (from Malay "duit" = money, "do-it-myself") is a TypeScript microservice platform that automates personal finance management:

- **Expense Tracker**: Processes Android banking app notifications and creates transactions in your budgeting app
- **CC Statement Manager**: Automates monthly credit card statement creation in Notion with Telegram reminders

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0-orange.svg)](https://bun.sh/)
[![Hono](https://img.shields.io/badge/Hono-4.0-green.svg)](https://hono.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 🎯 What It Does

### Expense Tracker

1. **Receives** banking app notifications from MacroDroid (Android automation)
2. **Extracts** transaction details using Gemini AI
3. **Enriches** with location data from GPS coordinates
4. **Syncs** to Lunch Money (or other budgeting platforms)
5. **Logs** everything for debugging and monitoring

**Result**: 90%+ reduction in manual expense tracking! 🎉

### CC Statement Manager

1. **Runs daily** at 1 AM via Dokploy cron scheduler
2. **Fetches** credit cards from Notion database
3. **Calculates** which month's statement to create
4. **Creates** statement entries in Notion automatically
5. **Notifies** you via Telegram with due dates

**Result**: Never miss a credit card payment! 📅

---

## 🏗️ Architecture

```
Android Notification
       ↓
   MacroDroid
       ↓
  Cloudflare Tunnel
       ↓
     Dokploy
       ↓
  duitmyself API
       ↓
  ┌─────────────────┐
  │ Filter by App   │
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │ AI Extraction   │ → Gemini API
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │ Location Lookup │ → LocationIQ API
  └────────┬────────┘
           ↓
  ┌─────────────────┐
  │ Budget Sync     │ → Lunch Money API
  └─────────────────┘
```

### Adapter Pattern

All external services use adapters for easy swapping:

- **AI Adapter**: Gemini (future: Claude, custom models)
- **Budget Adapter**: Lunch Money (future: YNAB, Actual Budget)
- **Geocoding Adapter**: LocationIQ (future: Google Maps)

---

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) installed
- API keys for:
  - [Gemini AI](https://ai.google.dev/)
  - [Lunch Money](https://lunchmoney.app/)
  - [LocationIQ](https://locationiq.com/)
- [MacroDroid](https://www.macrodroid.com/) on Android

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/duitmyself.git
cd duitmyself

# Install dependencies
bun install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env

# Start development server
bun run dev
```

The server will start on `http://localhost:3000`.

### Testing the Webhook

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "app_name": "Maybank MAE",
    "notification_title": "Transaction Alert",
    "notification_text": "You spent RM 45.50 at Starbucks",
    "timestamp": "2026-01-02T13:00:00+08:00",
    "latitude": "3.1390",
    "longitude": "101.6869"
  }'
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file (see `.env.example`):

```bash
# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# API Keys
GEMINI_API_KEY=your_gemini_api_key_here
LUNCH_MONEY_API_KEY=your_lunch_money_api_key_here
LOCATIONIQ_API_KEY=your_locationiq_api_key_here

# Security (optional)
WEBHOOK_SECRET=your_webhook_secret_for_signature_validation

# Account Mapping (optional, overrides config file)
ACCOUNT_MAYBANK_MAE=lunch_money_account_id_1
ACCOUNT_GRAB=lunch_money_account_id_2
ACCOUNT_TNG_EWALLET=lunch_money_account_id_3
ACCOUNT_SHOPEEPAY=lunch_money_account_id_4
```

### Account Mapping

Edit `config/account-mapping.json` to map banking apps to Lunch Money account IDs:

```json
{
  "Maybank MAE": "123456",
  "Grab": "123457",
  "TNG eWallet": "123458",
  "ShopeePay": "123459"
}
```

**Finding your Lunch Money account IDs**:
```bash
curl -X GET https://dev.lunchmoney.app/v1/assets \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Supported Banking Apps

Currently supported (easily extensible):
- ✅ Maybank MAE
- ✅ Grab
- ✅ TNG eWallet
- ✅ ShopeePay

Want to add more? See [AGENTS.md - Adding a New Banking App](AGENTS.md#adding-support-for-a-new-banking-app).

---

## 📱 MacroDroid Setup

1. **Install MacroDroid** on your Android device
2. **Create a new macro**:
   - **Trigger**: Notification Received
   - **Constraint**: App Name (select banking apps)
   - **Action**: HTTP Request
     - Method: POST
     - URL: `https://your-domain.com/webhook`
     - Content Type: JSON
     - Body:
       ```json
       {
         "app_name": "[app_name]",
         "notification_title": "[notification_title]",
         "notification_text": "[notification_text]",
         "timestamp": "[datetime]",
         "latitude": "[gps_latitude]",
         "longitude": "[gps_longitude]"
       }
       ```

3. **Enable GPS** for location tracking (optional but recommended)

---

## 🐳 Docker Deployment

### Build Docker Image

```bash
docker build -t duitmyself:latest .
```

### Run with Docker Compose

```bash
docker-compose up -d
```

### Deploy to Dokploy

1. **Connect GitHub repository** to Dokploy
2. **Configure environment variables** in Dokploy UI
3. **Deploy** - Dokploy will build and run the Docker container
4. **Set up Cloudflare Tunnel** to expose the service

See [AGENTS.md - Deployment Notes](AGENTS.md#deployment-notes) for detailed instructions.

---

## 🧪 Testing

```bash
# Run all tests
bun test

# Run unit tests only
bun test tests/unit

# Run integration tests
bun test tests/integration

# Run with coverage
bun test --coverage
```

---

## 📊 API Endpoints

### `POST /webhook`

Process a banking notification.

**Request**:
```json
{
  "app_name": "Maybank MAE",
  "notification_title": "Transaction Alert",
  "notification_text": "You spent RM 45.50 at Starbucks",
  "timestamp": "2026-01-02T13:00:00+08:00",
  "latitude": "3.1390",
  "longitude": "101.6869"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Transaction processed successfully",
  "transactionId": "abc123"
}
```

### `GET /health`

Health check endpoint.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-02T13:00:00+08:00",
  "uptime": 3600,
  "adapters": {
    "ai": "connected",
    "budget": "connected",
    "geocoding": "connected"
  }
}
```

### `GET /metrics`

Basic metrics (optional).

**Response**:
```json
{
  "totalTransactions": 1234,
  "successRate": 0.98,
  "averageProcessingTime": 1.5
}
```

---

## 📝 Logging

Structured JSON logs for easy parsing in Dokploy:

```json
{
  "level": "info",
  "time": 1704182400,
  "msg": "Transaction processed successfully",
  "transactionId": "abc123",
  "merchant": "Starbucks",
  "amount": 45.50,
  "processingTime": 1.2
}
```

**Log Levels**:
- `debug`: Detailed flow (AI prompts, API responses)
- `info`: Normal operations (transactions processed)
- `warn`: Recoverable issues (API retries)
- `error`: Failures requiring attention

**View logs**:
```bash
# Development (pretty-printed)
bun run dev

# Production (Dokploy UI)
# Navigate to project → Logs tab

# Docker
docker logs -f duitmyself
```

---

## 🛠️ Development

### Project Structure

```
duitmyself/
├── src/
│   ├── services/
│   │   └── expense-tracker/        # Current service
│   │       ├── adapters/            # External service abstractions
│   │       │   ├── ai/              # Gemini, future: Claude
│   │       │   ├── budget/          # Lunch Money, future: YNAB
│   │       │   └── geocoding/       # LocationIQ, future: Google Maps
│   │       ├── routes/              # HTTP endpoints
│   │       └── transaction-processor.service.ts
│   ├── shared/                      # Cross-service utilities
│   │   ├── utils/                   # Logger, validators
│   │   ├── types/                   # Shared TypeScript types
│   │   └── config/                  # Configuration management
│   ├── api/                         # API layer
│   │   ├── app.ts                   # Main Hono app
│   │   └── routes.ts                # Route aggregator
│   └── index.ts                     # Entry point
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── config/
│   └── account-mapping.json         # Banking app → account mapping
├── AGENTS.md                        # Developer & AI agent guide
├── README.md                        # This file
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

### Adding a New Feature

See [AGENTS.md](AGENTS.md) for comprehensive development guidelines, including:
- Adding new budget providers
- Adding new banking apps
- Modifying AI extraction prompts
- Debugging transaction failures

### Code Quality

```bash
# Lint
bun run lint

# Format
bun run format

# Type check
bun run type-check
```

---

## 🔒 Security

### Webhook Signature Validation

To prevent unauthorized requests, enable webhook signature validation:

1. Generate a secret: `openssl rand -hex 32`
2. Add to `.env`: `WEBHOOK_SECRET=your_secret`
3. Configure MacroDroid to sign requests with HMAC-SHA256
4. The service will validate signatures automatically

### Rate Limiting

Built-in rate limiting prevents abuse:
- **Default**: 100 requests per minute per IP
- **Configurable** in `src/api/app.ts`

### API Key Security

- ✅ Never commit `.env` to git
- ✅ Use environment variables in production
- ✅ Rotate API keys regularly
- ✅ Use separate keys for development and production

---

## 🗺️ Roadmap

### Phase 1: MVP ✅
- [x] Basic webhook endpoint
- [x] Gemini AI extraction
- [x] Lunch Money integration
- [x] Structured logging
- [x] Docker deployment

### Phase 2: Enhancements (Current)
- [ ] LocationIQ integration
- [ ] Webhook signature validation
- [ ] Rate limiting
- [ ] Retry logic with exponential backoff
- [ ] Unit and integration tests

### Phase 3: Future
- [ ] Web UI for viewing logs and transactions
- [ ] YNAB adapter
- [ ] Transaction deduplication
- [ ] Database for persistence
- [ ] Receipt OCR service
- [ ] Budget forecasting with AI

---

## 🤝 Contributing

This is a personal project, but contributions are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Hono** - Blazing fast web framework
- **Bun** - Fast all-in-one JavaScript runtime
- **Gemini AI** - Powerful AI for transaction extraction
- **Lunch Money** - Excellent budgeting platform
- **MacroDroid** - Android automation made easy

---

## 📧 Contact

**Developer**: Irman (Malaysia)  
**Issues**: [GitHub Issues](https://github.com/yourusername/duitmyself/issues)

---

**Made with ❤️ in Malaysia 🇲🇾**
