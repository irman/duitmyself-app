# AGENTS.md - Developer & AI Agent Guide

> **Purpose**: This document provides comprehensive context for AI agents and human developers working on the duitmyself codebase. It explains architectural decisions, development patterns, and operational knowledge to ensure continuity across different contributors.

---

## 1. Project Overview

### What is duitmyself?

**duitmyself** (from Malay "duit" = money, "do-it-myself") is a TypeScript microservice that automates personal expense tracking by processing Android banking app notifications and syncing them to budgeting platforms.

**Problem it solves**: Manual expense tracking is tedious and error-prone. This service eliminates 90%+ of manual data entry by automatically capturing transactions from banking app notifications and creating entries in budgeting apps like Lunch Money.

### The Journey: From n8n to Microservice

This project replaces an existing n8n workflow with a proper, maintainable codebase. The n8n workflow worked but had limitations:
- Hard to version control and test
- Difficult to extend with new features
- Limited error handling and debugging capabilities
- No type safety or code reusability

The microservice approach provides:
- ✅ Full TypeScript type safety
- ✅ Comprehensive logging and debugging
- ✅ Testable, modular architecture
- ✅ Easy to extend with new providers
- ✅ Version controlled and CI/CD ready

### Architecture Philosophy

**Core Principle**: Build for the future, not just the present.

This expense tracker is the **first service** in what will become a larger financial automation platform. The architecture reflects this:

1. **Modular Service Structure**: Each financial workflow lives in its own service directory (`/services/expense-tracker`, future: `/services/bill-reminders`, etc.)

2. **Adapter Pattern Everywhere**: All external dependencies (AI, budgeting platforms, geocoding) use adapters, making it trivial to swap providers or add new ones without touching business logic.

3. **Shared Utilities**: Common functionality (logging, validation, types) lives in `/shared` for reuse across services.

4. **API Versioning**: Routes are versioned (`/api/v1/...`) to support future API evolution without breaking existing integrations.

---

## 2. Key Design Decisions & Trade-offs

### Why Hono over Express/Fastify?

**Decision**: Use Hono as the web framework.

**Rationale**:
- **Bun-native**: Designed for modern runtimes (Bun, Deno, Node.js)
- **Lightweight**: Minimal overhead, fast routing
- **TypeScript-first**: Excellent type inference for routes and middleware
- **Modern API**: Clean, intuitive API similar to Express but more type-safe
- **Edge-ready**: Can run on Cloudflare Workers if needed in the future

**Trade-off**: Smaller ecosystem than Express, but the benefits outweigh this for a greenfield project.

### Why Adapter Pattern for External Services?

**Decision**: Abstract all external APIs behind adapter interfaces.

**Rationale**:
- **Provider Independence**: Switching from Gemini to Claude, or Lunch Money to YNAB, requires only implementing a new adapter—no changes to business logic.
- **Testability**: Easy to mock adapters in tests without complex HTTP mocking.
- **Future-proofing**: Can support multiple providers simultaneously (e.g., sync to both Lunch Money and YNAB).
- **Clear Contracts**: Interfaces document exactly what each provider must do.

**Example**: The `BudgetAdapter` interface means the transaction processor doesn't care if it's talking to Lunch Money, YNAB, or a custom database—it just calls `createTransaction()`.

### Why Bun over Node.js?

**Decision**: Use Bun as the runtime.

**Rationale**:
- **Performance**: Significantly faster than Node.js for most operations
- **Built-in tooling**: Native TypeScript support, test runner, bundler
- **Better DX**: Faster installs, simpler configuration
- **Modern**: Designed for current JavaScript/TypeScript best practices

**Trade-off**: Newer ecosystem, but stable enough for production use.

### Why ky for HTTP Requests?

**Decision**: Use `ky` for all external HTTP calls.

**Rationale**:
- **Modern fetch wrapper**: Built on native fetch API
- **Automatic retries**: Built-in retry logic with exponential backoff
- **TypeScript-first**: Excellent type inference
- **Lightweight**: No bloat, just what you need
- **Timeout handling**: Easy to configure per-request timeouts

**Alternative considered**: `axios` (more mature, but heavier and less modern).

### Logging Strategy

**Decision**: Structured JSON logging with pino.

**Rationale**:
- **Dokploy-friendly**: JSON logs are easily parsed and filtered in log aggregators
- **Contextual**: Each log entry includes request ID, transaction ID, and relevant metadata
- **Performance**: Pino is one of the fastest Node.js loggers
- **Development-friendly**: Pretty-printing in development mode for readability

**Log Levels**:
- `debug`: Detailed flow information (AI prompts, API responses)
- `info`: Normal operations (transaction processed, webhook received)
- `warn`: Recoverable issues (API retry, missing optional data)
- `error`: Failures requiring attention (API errors, validation failures)

### Error Handling Approach

**Decision**: Custom error classes with proper typing, no generic `Error` throws.

**Rationale**:
- **Type Safety**: Catch blocks can discriminate error types
- **Better Debugging**: Custom errors include context (which adapter, what operation)
- **Structured Logging**: Errors serialize to JSON with all relevant data

**Pattern**:
```typescript
class AIExtractionError extends Error {
  constructor(
    message: string,
    public readonly notificationText: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AIExtractionError';
  }
}
```

---

## 3. Development Guidelines

### Adding a New Budget Provider (e.g., YNAB)

1. **Create the adapter**:
   ```bash
   touch src/services/expense-tracker/adapters/budget/ynab.adapter.ts
   ```

2. **Implement the `BudgetAdapter` interface**:
   ```typescript
   import { BudgetAdapter } from './budget.interface';
   
   export class YNABAdapter implements BudgetAdapter {
     async createTransaction(transaction: Transaction): Promise<TransactionResult> {
       // YNAB API implementation
     }
     
     async validateCredentials(): Promise<boolean> {
       // Validate YNAB API key
     }
   }
   ```

3. **Add configuration**:
   - Add `YNAB_API_KEY` to `.env.example`
   - Update `src/shared/config/config.ts` to load the new env var
   - Add YNAB account mapping to `config/account-mapping.json`

4. **Update dependency injection**:
   - Modify `src/index.ts` to conditionally instantiate YNAB adapter based on env var
   - Or support multiple adapters simultaneously

5. **Test**:
   - Create `tests/unit/adapters/ynab.adapter.test.ts`
   - Test with mock YNAB API responses

### Adding Support for a New Banking App

1. **Update the filter list** in `src/services/expense-tracker/transaction-processor.service.ts`:
   ```typescript
   const ALLOWED_APPS = [
     'Maybank MAE',
     'Grab',
     'TNG eWallet',
     'ShopeePay',
     'NewBankApp', // Add here
   ];
   ```

2. **Add account mapping** in `config/account-mapping.json`:
   ```json
   {
     "NewBankApp": "lunch_money_account_id_5"
   }
   ```

3. **Test the notification format**:
   - Send a test notification from MacroDroid
   - Check logs to see if AI extraction works correctly
   - If extraction fails, update the AI prompt in `gemini.adapter.ts`

4. **Update documentation**:
   - Add the new app to README.md
   - Document any special handling needed

### Modifying the AI Extraction Prompt

The AI prompt is in `src/services/expense-tracker/adapters/ai/gemini.adapter.ts`.

**Current prompt structure**:
```typescript
const prompt = `
Extract transaction details from this banking notification:
"${text}"

Return JSON with:
- amount: number (positive for debit, negative for credit)
- merchant: string
- type: "debit" | "credit"
- category: string (optional, e.g., "Food & Dining", "Transportation")

Examples:
- "You spent RM 45.50 at Starbucks" → {"amount": 45.50, "merchant": "Starbucks", "type": "debit"}
- "Received RM 100.00 from John" → {"amount": -100.00, "merchant": "John", "type": "credit"}
`;
```

**When to modify**:
- AI consistently misses certain transaction types
- New banking app has different notification format
- Want to extract additional fields (e.g., transaction ID, balance)

**Best practices**:
- Provide clear examples in the prompt
- Use JSON schema enforcement (already implemented)
- Test changes with real notification samples
- Log the AI response for debugging

### Debugging Transaction Processing Failures

**Step 1: Check the logs**

Logs are structured JSON, viewable in Dokploy or locally:
```bash
bun run dev | bunyan  # Pretty-print JSON logs
```

**Step 2: Identify the failure point**

Each pipeline step logs its input/output:
1. `webhook.received` - Did the webhook receive the notification?
2. `filter.result` - Was the app in the allowed list?
3. `ai.extraction.request` - What text was sent to AI?
4. `ai.extraction.response` - What did AI return?
5. `location.lookup` - Did geocoding work?
6. `budget.create.request` - What was sent to Lunch Money?
7. `budget.create.response` - Did Lunch Money accept it?

**Step 3: Common issues**

| Issue | Cause | Solution |
|-------|-------|----------|
| AI extraction fails | Unusual notification format | Update AI prompt with examples |
| Location lookup fails | Invalid GPS coordinates | Check MacroDroid GPS permission |
| Budget creation fails | Invalid account ID | Verify account mapping config |
| Webhook not received | Cloudflare Tunnel down | Check tunnel status |

**Step 4: Test locally**

Use curl to replay the failed notification:
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d @failed-notification.json
```

### Adding New Environment Variables

1. **Add to `.env.example`** with description:
   ```
   # New Feature API Key
   NEW_FEATURE_API_KEY=your_api_key_here
   ```

2. **Update validation schema** in `src/shared/utils/validators.ts`:
   ```typescript
   const envSchema = z.object({
     // ... existing vars
     NEW_FEATURE_API_KEY: z.string().min(1),
   });
   ```

3. **Add to config** in `src/shared/config/config.ts`:
   ```typescript
   export const config = {
     // ... existing config
     newFeature: {
       apiKey: env.NEW_FEATURE_API_KEY,
     },
   };
   ```

4. **Update documentation**:
   - Add to README.md configuration section
   - Update deployment docs if needed

---

## 4. Testing Strategy

### Unit Tests

**What to test**: Individual adapters and utilities in isolation.

**Pattern**:
```typescript
// tests/unit/adapters/gemini.adapter.test.ts
import { describe, it, expect, mock } from 'bun:test';
import { GeminiAdapter } from '@/services/expense-tracker/adapters/ai/gemini.adapter';

describe('GeminiAdapter', () => {
  it('should extract transaction from notification text', async () => {
    const adapter = new GeminiAdapter(mockConfig);
    const result = await adapter.extractTransactionData(
      'You spent RM 45.50 at Starbucks'
    );
    
    expect(result.amount).toBe(45.50);
    expect(result.merchant).toBe('Starbucks');
    expect(result.type).toBe('debit');
  });
});
```

**Run**: `bun test tests/unit`

### Integration Tests

**What to test**: Full transaction pipeline with mocked external APIs.

**Pattern**:
```typescript
// tests/integration/transaction-pipeline.test.ts
import { describe, it, expect } from 'bun:test';
import { app } from '@/api/app';

describe('Transaction Pipeline', () => {
  it('should process webhook end-to-end', async () => {
    const response = await app.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockWebhookPayload),
    });
    
    expect(response.status).toBe(200);
    // Verify transaction was created in mock budget adapter
  });
});
```

**Run**: `bun test tests/integration`

### E2E Tests

**What to test**: Real webhook → real APIs (in test mode).

**Setup**:
- Use test API keys for Gemini, Lunch Money, LocationIQ
- Create a test Lunch Money account
- Send real webhook payloads

**Run**: `bun test tests/e2e` (requires test API keys in `.env.test`)

### Testing Standards

- ✅ All adapters must have unit tests
- ✅ All public functions must have JSDoc comments
- ✅ Integration tests for happy path and error cases
- ✅ E2E tests for critical flows before production deployment
- ✅ Aim for >80% code coverage

---

## 5. Deployment Notes

### Cloudflare Tunnel + Dokploy Architecture

**Flow**:
```
Internet
  ↓
Cloudflare Tunnel (cloudflared)
  ↓
Dokploy (Traefik reverse proxy)
  ↓
duitmyself Docker container
```

**Why this setup?**
- **Dynamic IP**: Server doesn't have static IP, Cloudflare Tunnel provides stable endpoint
- **Security**: No exposed ports, all traffic through Cloudflare's network
- **SSL**: Automatic HTTPS via Cloudflare
- **Dokploy**: Manages Docker deployments, logs, and monitoring

### Deploying to Production

**Prerequisites**:
1. Cloudflare Tunnel configured and running
2. Dokploy installed and accessible
3. GitHub repository connected to Dokploy
4. Environment variables configured in Dokploy

**Deployment steps**:
1. Push code to GitHub: `git push origin main`
2. Dokploy auto-detects changes (if webhook configured)
3. Dokploy builds Docker image
4. Dokploy deploys new container
5. Health check verifies deployment
6. Old container is stopped

**Manual deployment**:
```bash
# In Dokploy UI
1. Go to duitmyself project
2. Click "Deploy"
3. Monitor logs for errors
4. Verify health check passes
```

### Viewing Logs in Production

**Dokploy UI**:
1. Navigate to duitmyself project
2. Click "Logs" tab
3. Filter by log level or search for keywords

**CLI** (if SSH access):
```bash
docker logs -f duitmyself --tail 100
```

**Log format**: JSON, one log entry per line
```json
{"level":"info","time":1704182400,"msg":"Transaction processed","transactionId":"abc123","merchant":"Starbucks"}
```

### Rollback Procedure

If deployment fails:
1. In Dokploy, go to "Deployments" history
2. Click "Rollback" on previous working version
3. Dokploy redeploys old container
4. Investigate failure in logs

### Environment Variables in Production

**Set in Dokploy UI**:
1. Project Settings → Environment Variables
2. Add each variable from `.env.example`
3. Mark sensitive vars as "Secret" (hidden in UI)
4. Redeploy for changes to take effect

**Never commit** `.env` to git!

---

## 6. Common Tasks

### Task: Add a New Geocoding Provider (e.g., Google Maps)

**Files to modify**:
1. `src/services/expense-tracker/adapters/geocoding/google-maps.adapter.ts` (new)
2. `src/shared/config/config.ts` (add Google Maps API key)
3. `.env.example` (document new env var)
4. `src/index.ts` (instantiate adapter based on config)

**Implementation**:
```typescript
// google-maps.adapter.ts
import { GeocodingAdapter } from './geocoding.interface';
import ky from 'ky';

export class GoogleMapsAdapter implements GeocodingAdapter {
  constructor(private apiKey: string) {}
  
  async reverseGeocode(lat: number, lon: number): Promise<string> {
    const response = await ky.get('https://maps.googleapis.com/maps/api/geocode/json', {
      searchParams: {
        latlng: `${lat},${lon}`,
        key: this.apiKey,
      },
    }).json<GoogleMapsResponse>();
    
    return response.results[0]?.formatted_address || `${lat}, ${lon}`;
  }
  
  async validateApiKey(): Promise<boolean> {
    try {
      await this.reverseGeocode(0, 0);
      return true;
    } catch {
      return false;
    }
  }
}
```

### Task: Add Webhook Signature Validation

**Purpose**: Prevent unauthorized requests to the webhook endpoint.

**Implementation**:
1. Generate a secret key: `openssl rand -hex 32`
2. Add to `.env`: `WEBHOOK_SECRET=your_secret_here`
3. Configure MacroDroid to sign requests (HMAC-SHA256)
4. Add validation middleware in `webhook.route.ts`:

```typescript
import { createHmac } from 'crypto';

function validateSignature(body: string, signature: string, secret: string): boolean {
  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return signature === expectedSignature;
}

// In route handler
const signature = c.req.header('X-Webhook-Signature');
if (!validateSignature(rawBody, signature, config.webhookSecret)) {
  return c.json({ error: 'Invalid signature' }, 401);
}
```

### Task: Add Rate Limiting

**Purpose**: Prevent abuse while allowing legitimate traffic.

**Implementation** (using Hono rate limit middleware):
```typescript
import { rateLimiter } from 'hono-rate-limiter';

app.use('/webhook', rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later',
}));
```

**Note**: Be lenient—MacroDroid may send bursts of notifications.

### Task: Handle 3rd Party API Rate Limits

**Problem**: Gemini/Lunch Money/LocationIQ have rate limits.

**Solution**: Implement retry with exponential backoff (already in `ky` config):

```typescript
// In adapter
const response = await ky.post(url, {
  retry: {
    limit: 3,
    methods: ['post'],
    statusCodes: [429, 500, 502, 503, 504],
    backoffLimit: 10000, // Max 10s delay
  },
  hooks: {
    beforeRetry: [
      ({ request, options, error, retryCount }) => {
        logger.warn('Retrying API request', { url, retryCount, error });
      },
    ],
  },
});
```

**For 429 (rate limit)**: Respect `Retry-After` header if present.

---

## 7. Technical Context

### Project Structure Explained

```
/src
  /services
    /expense-tracker          # Current MVP service
      /adapters               # External service abstractions
        /ai                   # AI extraction (Gemini, future: Claude)
        /budget               # Budget platforms (Lunch Money, future: YNAB)
        /geocoding            # Location services (LocationIQ, future: Google Maps)
      /routes                 # HTTP endpoints
      transaction-processor.service.ts  # Core business logic
    
    /shared                   # Cross-service utilities
      /utils                  # Logger, validators, helpers
      /types                  # Shared TypeScript types
      /config                 # Configuration management
  
  /api                        # API layer (aggregates all services)
    app.ts                    # Main Hono app
    routes.ts                 # Route aggregator
  
  index.ts                    # Entry point
```

**Why this structure?**
- **Scalability**: Easy to add new services (e.g., `/services/bill-reminders`)
- **Separation of Concerns**: Business logic separate from API layer
- **Reusability**: Shared utilities avoid duplication
- **Testability**: Each layer can be tested independently

### Dependency Injection Pattern

**Why**: Makes testing easier and allows runtime configuration.

**Pattern**:
```typescript
// src/index.ts
const geminiAdapter = new GeminiAdapter(config.gemini.apiKey);
const lunchMoneyAdapter = new LunchMoneyAdapter(config.lunchMoney.apiKey);
const locationIQAdapter = new LocationIQAdapter(config.locationIQ.apiKey);

const transactionProcessor = new TransactionProcessor({
  aiAdapter: geminiAdapter,
  budgetAdapter: lunchMoneyAdapter,
  geocodingAdapter: locationIQAdapter,
  logger,
});

// In tests
const mockAI = new MockAIAdapter();
const processor = new TransactionProcessor({
  aiAdapter: mockAI,
  // ... other mocks
});
```

### Error Handling Philosophy

**Principle**: Fail gracefully, log everything, don't crash.

**Pattern**:
1. **Validation errors**: Return 400 with details
2. **External API errors**: Retry, then return 502 if all retries fail
3. **Internal errors**: Log with full context, return 500
4. **Non-critical failures**: Log warning, continue processing (e.g., location lookup fails, still create transaction)

**Example**:
```typescript
try {
  const location = await geocodingAdapter.reverseGeocode(lat, lon);
  transaction.notes = `Location: ${location}`;
} catch (error) {
  logger.warn('Location lookup failed, continuing without location', { error });
  // Don't fail the entire transaction
}
```

### Performance Considerations

**Current scale**: Low volume (personal use, <100 transactions/day)

**Optimizations applied**:
- ✅ Async/await throughout (non-blocking)
- ✅ Bun runtime (faster than Node.js)
- ✅ Minimal dependencies (smaller Docker image)
- ✅ Structured logging (fast JSON serialization)

**Future optimizations** (if needed):
- Add Redis for caching geocoding results
- Implement request queuing for high volume
- Add database for transaction history and deduplication

---

## 8. Future Roadmap

### Short-term (Next 3 months)
- [ ] Add more banking apps (CIMB, Hong Leong Bank)
- [ ] Implement YNAB adapter
- [ ] Add transaction deduplication
- [ ] Create simple web UI for viewing logs

### Medium-term (6 months)
- [ ] Add receipt OCR service (scan receipts → extract data)
- [ ] Implement bill reminder service
- [ ] Add database for transaction history
- [ ] Create analytics dashboard

### Long-term (1 year+)
- [ ] Investment portfolio tracking
- [ ] Budget forecasting with AI
- [ ] Multi-user support
- [ ] Mobile app for manual entry

---

## 9. Troubleshooting

### Issue: Webhook not receiving notifications

**Possible causes**:
1. Cloudflare Tunnel down
2. MacroDroid not configured correctly
3. Firewall blocking requests
4. Dokploy container not running

**Debug steps**:
```bash
# Check Cloudflare Tunnel status
cloudflared tunnel info

# Check Dokploy container
docker ps | grep duitmyself

# Test webhook locally
curl -X POST https://your-domain.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"app_name":"Maybank MAE","notification_text":"Test"}'
```

### Issue: AI extraction returning incorrect data

**Possible causes**:
1. Notification format changed
2. AI prompt needs refinement
3. Gemini API rate limit

**Debug steps**:
1. Check logs for `ai.extraction.request` and `ai.extraction.response`
2. Copy the notification text and test manually with Gemini
3. Update prompt with new examples
4. Check Gemini API quota

### Issue: Transactions not appearing in Lunch Money

**Possible causes**:
1. Invalid account ID
2. Lunch Money API key expired
3. Transaction validation failed

**Debug steps**:
1. Check logs for `budget.create.request` and `budget.create.response`
2. Verify account mapping in config
3. Test Lunch Money API manually:
   ```bash
   curl -X GET https://dev.lunchmoney.app/v1/accounts \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```

---

## 10. Resources

### Documentation
- [Hono Documentation](https://hono.dev/)
- [Bun Documentation](https://bun.sh/docs)
- [Lunch Money API](https://lunchmoney.dev/)
- [Gemini API](https://ai.google.dev/docs)
- [LocationIQ API](https://locationiq.com/docs)

### Tools
- [Dokploy](https://dokploy.com/) - Deployment platform
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) - Secure tunnel
- [MacroDroid](https://www.macrodroid.com/) - Android automation

### Contact
- **Developer**: Irman (Malaysia)
- **Repository**: [GitHub link once created]
- **Deployment**: Dokploy instance

---

**Last Updated**: 2026-01-02  
**Version**: 1.0.0  
**Status**: Active Development
