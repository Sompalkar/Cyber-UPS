# Carrier Integration Service

Shipping carrier integration service built in TypeScript. Wraps the UPS Rating API to provide normalized rate quotes. The architecture is set up so we can add more carriers (FedEx, USPS, DHL) and more operations (labels, tracking) without rewriting existing code.

## Setup

```bash
npm install
cp .env.example .env    # add your UPS credentials here
```

## Running

```bash
npm test                # run all 45 tests
npm run typecheck       # type check without building
npm run demo            # quick CLI demo of the rate flow
```

For postgres (optional — used for storing rate quotes and audit logs):

```bash
docker compose up -d
npm run db:migrate
```

## Project Layout

```
src/
  domain/       - carrier-agnostic types, Zod validation, error classes
  config/       - env-based config with fail-fast on missing vars
  http/         - axios wrapper that maps errors to our structured types
  carriers/     - CarrierAdapter interface + registry
  carriers/ups/ - UPS-specific: OAuth, types, mapper, adapter
  services/     - RatingService orchestrator
  db/           - postgres pool, migrations, repositories
tests/
  fixtures/     - stubbed UPS API responses
  ups/          - auth, mapper, carrier adapter tests
  services/     - rating service tests
```

## Design Decisions

**Carrier abstraction** — Every carrier implements a small `CarrierAdapter` interface (just `name`, `getSupportedServices`, `getRates`). They register themselves in a `CarrierRegistry`. To add FedEx you'd create `src/carriers/fedex/`, implement the interface, and call `registry.register(fedexCarrier)`. Nothing in the UPS code or the rating service changes.

**Domain boundary** — There's a strict separation between our internal types (`RateRequest`, `RateQuote` in `src/domain/`) and the carrier-specific API shapes (`UpsRateRequest`, `UpsRatedShipment` in `src/carriers/ups/types.ts`). Pure mapper functions translate between them. The caller never deals with UPS's quirks (everything being strings, inconsistent array vs object responses, etc).

**Zod for runtime validation** — TypeScript types are compile-time only. When JSON hits our service at runtime, Zod validates it — package weights, address formats, dimensions, girth limits. Bad input gets caught before any HTTP call goes out. Zod also gives good error messages with field paths.

**OAuth token lifecycle** — UPS uses client-credentials OAuth. The auth provider caches tokens in memory, refreshes 60s before expiry (safety buffer so tokens don't expire mid-request), and uses a pending-promise pattern so concurrent requests don't trigger duplicate token fetches.

**Structured errors** — Instead of throwing generic `Error`s, there's a hierarchy: `AuthenticationError`, `RateLimitError`, `TimeoutError`, `ParseError`, etc. Each has an error code, carrier name, and a `retryable` flag. The HTTP client maps axios errors into these automatically — 429 becomes `RateLimitError`, timeouts become `TimeoutError`, 5xx are retryable, 4xx are not.

**Multi-carrier fan-out** — `Promise.allSettled()` queries all registered carriers concurrently. If one carrier is down, the rest still return quotes. Partial results beat no results.

**Database is optional** — Postgres stores rate quotes and audit logs, but the rating service works fine without it. DB errors are caught and logged, never propagated to the caller. The core rate flow shouldn't break because of a database issue.

## 🚀 Future Roadmap & Improvements

If I had more time, here are the system design improvements I would implement to make this service production-ready at scale:

### 1. Layer 2 Caching (Redis)
**Goal:** Reduce API costs and improve latency for frequent routes.
- **Strategy:** Cache rate quotes for 1 hour keyed by a hash of `origin + destination + total_weight`.
- **Implementation:**
  - Check Redis before calling `carrier.getRates()`.
  - Use a **stale-while-revalidate** pattern: return cached data immediately, then fetch fresh rates in the background to update the cache.
  - **Benefit:** Massive performance boost for common lanes (e.g., "NY to LA, 1lb package").

### 2. Circuit Breaker Pattern
**Goal:** Prevent cascading failures when simple timeouts aren't enough.
- **Strategy:** If UPS returns 500s or timeouts > 50% of the time, **stop calling them** for 30 seconds.
- **Implementation:**
  - Wrap `carrier.getRates()` in a state machine (Closed → Open → Half-Open).
  - **Fail Fast:** Immediately return "UPS Temporarily Unavailable" without waiting for a 15s timeout.
  - **Benefit:** Protects our system resources and allows UPS time to recover.

### 3. Observability & Metrics
**Goal:** Debug production issues without guessing.
- **Strategy:** Structured JSON logging and APM metrics.
- **Implementation:**
  - Log every outbound carrier request with `request_id`, `latency_ms`, and `status_code` (masking PII/credentials).
  - Emit metrics: `rates.ups.success`, `rates.ups.failure`, `rates.ups.latency_p99`.
  - **Benefit:** We can set alerts like "Page duty if UPS error rate > 5%".

### 4. Resiliency: Exponential Backoff
**Goal:** Handle transient network blips gracefully.
- **Strategy:** Retry failed requests with increasing delays (100ms, 200ms, 400ms).
- **Implementation:**
  - Apply only to retryable errors (5xx, Network Errors).
  - Add **Jitter** (randomness) to prevent thundering herd problems (where all retries hit at once).

### 5. Client-Side Rate Limiting
**Goal:** Be a good citizen of the UPS API.
- **Strategy:** Rate limit our own outgoing requests.
- **Implementation:**
  - Use a **Token Bucket** algorithm locally or in Redis.
  - Limit to X requests/sec. Queue excess requests or reject them immediately to avoid getting banned by UPS.

## Tests

45 tests, all using stubbed HTTP (no API calls needed):

- **auth** (9) — token fetch, caching, concurrent dedup, refresh, invalidation, errors
- **mapper** (12) — request building, response parsing, negotiated rates, edge cases
- **carrier** (10) — full UPS adapter flow, HTTP 400/500/429, timeouts, malformed JSON
- **rating service** (14) — input validation, carrier delegation, multi-carrier fan-out, result sorting
