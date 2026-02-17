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

## What I'd Improve

- Rate caching — check for recent quotes on the same lane before calling UPS. Schema already supports it.
- Retry with exponential backoff and jitter for transient failures. Right now we only retry once on auth failures.
- Circuit breaker — if UPS is returning 500s consistently, fail fast instead of hammering them.
- Structured JSON logging with request IDs, timing, and masked credentials.
- Client-side rate limiting to avoid hitting 429s in the first place.
- OpenAPI spec generation if we add an HTTP API layer on top.

## Tests

45 tests, all using stubbed HTTP (no API calls needed):

- **auth** (9) — token fetch, caching, concurrent dedup, refresh, invalidation, errors
- **mapper** (12) — request building, response parsing, negotiated rates, edge cases
- **carrier** (10) — full UPS adapter flow, HTTP 400/500/429, timeouts, malformed JSON
- **rating service** (14) — input validation, carrier delegation, multi-carrier fan-out, result sorting
