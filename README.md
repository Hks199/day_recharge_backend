# Multi-tenant Recharge SaaS backend

Node.js 24, strict TypeScript, Express 5, MongoDB/Mongoose, Redis/BullMQ, Argon2id, JWT, Zod, Pino and OpenAPI. One shared deployment serves verified custom domains. Exactly four roles: Developer, Super Admin, Distributor, Retailer.

## Quick start

1. Install Node.js 24 and Docker Desktop, and start the Docker engine.
2. Run `npm ci`. Copy `.env.example` to `.env` and generate **different** random values for `JWT_SECRET` and `WEBHOOK_SECRET` with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
3. Run `docker compose up --build -d`. Compose starts a single-node replica set, durable Redis, API and worker. This Compose file is for local development; MongoDB has no authentication and is bound to loopback on the host.
4. Run `docker compose exec api node dist/scripts/indexes.js`, then `docker compose exec api node dist/scripts/seed.js` with `NODE_ENV=development` in `.env`. Seed creates a development plan and five mock operators. It never creates users or money.
5. Bootstrap the Developer once using the protected CLI described below.
6. Open `http://localhost:3000/api/docs`. Liveness: `/health`; readiness: `/ready`. API readiness checks MongoDB and Redis; monitor worker separately.

Local Node processes can connect to Compose MongoDB using `mongodb://127.0.0.1:27017/day_recharge?replicaSet=rs0&directConnection=true`. The replica set advertises the Compose service name `mongo`, so use directConnection for host-side development. If ports are occupied set MONGO_PORT, REDIS_PORT or API_PORT in `.env` and update the corresponding host-side connection URLs. Run `npm run dev` and `npm run worker` in separate terminals if running outside Docker; avoid occupying port 3000 with both Docker API and local API. This workspace's generated local environment uses MongoDB port 27018 because 27017 was already occupied.

## Protected bootstrap

Set `BOOTSTRAP_NAME`, `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PHONE`, `BOOTSTRAP_PASSWORD` in the process environment. Passwords must have 12–128 characters. Run `npm run bootstrap` outside Docker, or pass these environment variables with `docker compose exec -e BOOTSTRAP_NAME -e BOOTSTRAP_EMAIL -e BOOTSTRAP_PHONE -e BOOTSTRAP_PASSWORD api node dist/scripts/bootstrap.js`. Clear the password from the environment afterwards. Do not put credentials in source files or command history. Bootstrap refuses to run if a Developer exists. There is no public registration endpoint.

## Provision a tenant

Authenticate with `POST /api/platform/auth/login` on a configured `PLATFORM_HOSTS` hostname. Use the access token as `Authorization: Bearer …` on subsequent calls. Refresh token is an HTTP-only cookie; use the returned CSRF token for refresh/logout.

Create a plan with `POST /api/platform/plans` or select the development plan. Call `POST /api/platform/tenants` with `name`, unique `slug`, `planId`, and `owner: {name,email,phone,password}`. This atomically creates the tenant, designated Super Admin, wallet, settings and subscription.

Add a domain with `POST /api/platform/tenants/:id/domains`. Publish the returned TXT value at the returned TXT name. Call `POST /api/platform/tenants/:id/domains/:domainId/verify`, then `PATCH …/:domainId/primary`. Domain verification always checks DNS; a client cannot set a verified flag. For local development, use a real DNS zone you control with TXT records and map its hostnames to loopback, or use the isolated integration suite, which injects a DNS resolver directly into the service. Never add a production DNS verification bypass.

Log in as the owner on that tenant domain at `POST /api/auth/login`. Create Distributors and Retailers using `/api/users/distributors` and `/api/users/retailers`. A Distributor can only create Retailers. Tenant IDs in request bodies do not grant authority.

## Wallet and mock payment walkthrough

Create `/api/wallet/funding-requests` with `amountMinor` and a unique externally confirmed bank `reference`. A Developer approves tenant owner funding through `/api/platform/tenants/:id/funding-requests/:fundingId/decision`, body `{ "approve": true }`. A Super Admin can approve external deposits for downline users, but cannot approve their own funding. These are manual, audited bank-verification workflows, not a bank integration.

Transfer to an authorized downline using `/api/wallet/transfers`, an `Idempotency-Key` header, and `{toUserId,amountMinor}`. All money is integer paise.

A Retailer calls `POST /api/recharges` with `Idempotency-Key` and `{serviceType:"MOBILE",operatorId,account,amountMinor}`. The worker consumes the durable outbox through BullMQ. Mock accounts ending `0000` fail and refund; `9999` simulate an ambiguous timeout; `8888` stay pending; other accounts succeed. To complete a pending mock order, send a signed webhook as documented in OpenAPI. For bill services first call `/api/bill-payments/inquiries`, then submit the matching returned amount and `billId` to `/api/bill-payments`. Mock bill amount is 10,000 paise. Bill inquiries are single use.

Commission rules represent **direct payouts**, funded from the tenant owner's wallet, with percent values in basis points. New payments reserve commission funding and snapshot eligible hierarchy rules. The development operator budget is 5%. See [commission policy](docs/COMMISSION_ENGINE.md).

## Commands and documentation

`npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, `npm run indexes`, `npm run seed`, `npm run bootstrap`.

Tests create an ephemeral MongoDB replica set; no development or production database is used. First run downloads the MongoDB binary. [Testing](docs/TESTING.md) explains integration and infrastructure checks.

Read [architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE.md), [API](docs/API_SPEC.md), [permissions](docs/RBAC.md), [tenant resolution](docs/TENANT_RESOLUTION.md), [wallet policy](docs/WALLET_AND_LEDGER.md), [recharge flow](docs/RECHARGE_FLOW.md), [deployment](docs/DEPLOYMENT.md), [security](docs/SECURITY.md), and [implementation status](docs/IMPLEMENTATION_STATUS.md).

## Integration boundaries

Only MOCK payments and mock bill fetch are implemented. Live recharge/BBPS connectivity and compliance certification require a real provider agreement, documented adapter, credentials and integration verification. No endpoints or credentials are invented. Password reset requires an internal authenticated delivery endpoint configured in `.env`; it returns 503 until configured. Subscription assignment is administrative; automatic card collection, GST invoices and bank settlement imports are outside this backend. Production deployment requires authenticated infrastructure, TLS, backups, monitoring and a security review.
