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
