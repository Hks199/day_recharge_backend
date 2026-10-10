# CODEX MASTER PROMPT — Multi-Tenant Recharge SaaS Backend

## YOUR ROLE

Act as a Principal Backend Architect, Senior Node.js Developer, MongoDB Database Architect, Fintech Security Engineer, and SaaS Infrastructure Engineer.

Your task is to design, implement, test, document, and prepare a complete production-oriented multi-tenant Recharge and Bill Payment SaaS backend.

Do not merely explain the architecture or generate example snippets. Actually create and update the project files, implement working APIs, configure the database, add tests, and run available verification commands.

If an existing repository is provided, inspect its structure and dependencies first. Preserve compatible functionality and avoid unnecessary rewrites.

Use clean architecture, modular code, strict TypeScript, secure authentication, maintainable services, and industry-standard engineering practices.

---

# 1. TECHNOLOGY STACK

Use:

- Node.js with TypeScript
- Express.js
- MongoDB
- Mongoose
- JWT authentication
- HTTP-only cookies where appropriate
- Argon2id for password hashing
- Zod for request validation
- rate limiter
- BullMQ for background processing
- Pino for structured logging
- Helmet for HTTP security headers
- CORS with tenant-aware origin allowlisting
- Vitest or Jest with Supertest
- Docker and Docker Compose
- OpenAPI / Swagger documentation

Use the latest stable compatible package versions. Avoid deprecated packages and APIs.

Enable strict TypeScript checking.

# 2. PROJECT OBJECTIVE

Build a white-label, multi-tenant SaaS platform for Indian mobile recharge and bill payment businesses.

The SaaS platform owner sells the complete software service to multiple clients.

Each client operates their own business using a custom domain.

Example:

Client A:
- Domain: dayrecharge.com
- Branding: Day Recharge
- Own Super Admin
- Own Distributors
- Own Retailers
- Own wallets, commissions, transactions, reports, and settings

Client B:
- Domain: clientb.com
- Branding: Client B
- Own Super Admin
- Own Distributors
- Own Retailers
- Completely isolated business data

Both clients must be served using shared frontend and backend deployments.

Tenant-specific configuration must be resolved dynamically.

No separate backend deployment is required for every client.

# 3. USER ROLES AND HIERARCHY

There are exactly four roles:

1. DEVELOPER
2. SUPER_ADMIN
3. DISTRIBUTOR
4. RETAILER

IMPORTANT: DO NOT IMPLEMENT MASTER_DISTRIBUTOR.

## Developer

The Developer is the SaaS platform owner.

Permissions:
- Create tenants
- Create tenant Super Admins
- Manage all tenants
- Configure SaaS plans
- Activate or suspend tenants
- Manage tenant domains
- View platform-wide analytics
- Manage subscriptions
- Configure global recharge provider integrations
- View platform audit logs
- Manage platform-level settings

Developer is a platform-level role, not a normal tenant user.

Developer accounts must not be creatable through public registration.

Global access must be implemented through explicit, audited platform administration operations.

## Super Admin

The Super Admin purchases the SaaS service.

Permissions:
- Manage their tenant
- Update tenant branding
- Manage their own domain settings
- Create Distributors
- Create Retailers directly
- Manage all tenant Distributors
- Manage all tenant Retailers
- Configure tenant commission rules
- Manage tenant wallets
- View all tenant transactions
- View tenant reports
- Manage recharge and bill payment settings permitted by the platform
- Configure tenant-specific operational settings

Super Admin must never access another tenant.

## Distributor

Permissions:
- Create Retailers
- Manage their own Retailers
- View their downline Retailers
- Transfer wallet funds to their authorized Retailers
- View their wallet
- View permitted downline transactions
- View their commission earnings
- View their reports

A Distributor cannot create another Distributor or Super Admin.

A Distributor must not manage Retailers belonging to another Distributor.

## Retailer

Permissions:
- Login and manage profile
- View wallet balance
- Perform mobile recharge
- Perform DTH recharge
- Perform supported bill payments
- View transaction history
- View recharge status
- View commission earnings
- Submit support tickets

Retailers cannot create other users.

## Creation matrix

DEVELOPER -> SUPER_ADMIN (through tenant provisioning)

SUPER_ADMIN -> DISTRIBUTOR

SUPER_ADMIN -> RETAILER

DISTRIBUTOR -> RETAILER

RETAILER -> No user creation

Implement and test these permissions on the backend.

# 4. MULTI-TENANT ARCHITECTURE

Use a shared MongoDB database with tenant-based logical isolation.

Every tenant-owned business document must contain tenantId.

Developer accounts are platform scoped and have tenantId = null.

Implement:

- Tenant identification
- Custom domain resolution
- Tenant context middleware
- Tenant-aware authentication
- Tenant-aware authorization
- Tenant-scoped database queries
- Tenant-specific settings
- Tenant-specific branding
- Tenant suspension checks

Never trust tenantId supplied by the frontend for authorization.

For tenant-facing requests, resolve the tenant from a verified domain mapping or another authenticated, server-validated tenant context.

Validate the authenticated user's tenantId against the resolved tenantId.

Reject mismatches.

Do not allow a user from Tenant A to access Tenant B by modifying URLs, request bodies, headers, cookies, or ObjectIds.

# 5. CUSTOM DOMAIN SUPPORT

Create tenant domain management.

Required functionality:
- Add domain
- Normalize domain
- Validate hostname
- Verify domain ownership
- Mark domain verified
- Set primary domain
- Remove domain
- Resolve tenant by domain
- Reject unknown domains
- Reject unverified domains
- Prevent duplicate domains
- Support www and apex domains using explicit mappings

Example:

dayrecharge.com -> Tenant A

clientb.com -> Tenant B

Implement a public endpoint:

GET /api/public/tenant-config

Return safe public configuration:
- Tenant name
- Logo
- Primary color
- Secondary color
- Domain
- Public feature flags
- Public support contact

Never expose API secrets, private configuration, wallet details, or other tenant data.

Document the DNS, reverse proxy, TLS certificate, and shared frontend deployment requirements.

Implement a domain resolution strategy that works both when the API is on the same hostname and when the API is hosted on a shared api.example.com hostname.

Do not blindly trust Origin, Host, X-Forwarded-Host, or a client-provided tenant ID.

Only trust configured proxies and verified tenant mappings.

# 6. DATABASE MODELS

Create complete Mongoose models with TypeScript interfaces, validation, references, timestamps, and appropriate indexes.

Required collections:

1. users
2. tenants
3. tenant_domains
4. subscriptions
5. subscription_plans
6. wallets
7. wallet_ledger
8. wallet_transfers
9. transactions
10. recharge_orders
11. recharge_providers
12. recharge_operators
13. commission_rules
14. commission_records
15. tenant_settings
16. refresh_tokens or secure session records
17. audit_logs
18. notifications
19. support_tickets
20. idempotency_records
21. provider_webhook_events
22. reconciliation_records

Add other collections only when justified.

## User model

Fields:
- _id
- tenantId
- name
- email
- phone
- passwordHash
- role
- parentId
- createdBy
- status
- lastLoginAt
- createdAt
- updatedAt

Role enum:

DEVELOPER
SUPER_ADMIN
DISTRIBUTOR
RETAILER

Never include MASTER_DISTRIBUTOR.

parentId represents business hierarchy.

createdBy represents the actual creator.

Rules:
- Developer: tenantId = null, parentId = null
- Super Admin: tenantId required, parentId = null
- Distributor: tenantId required, parentId references a Super Admin
- Retailer: tenantId required, parentId references either a Super Admin or Distributor

Validate parent roles and tenant consistency.

Use tenant-scoped unique indexes where appropriate.

Prevent privilege escalation through role updates.

## Tenant model

Fields:
- _id
- name
- slug
- ownerId
- status
- branding
- contactDetails
- subscriptionId
- createdAt
- updatedAt

A tenant must have one designated owner Super Admin.

Implement safe transactional tenant provisioning.

## Wallet model

Fields:
- _id
- tenantId
- userId
- currency
- balanceMinor
- status
- createdAt
- updatedAt

Use integer minor units (paise) for INR.

Do not use JavaScript floating-point calculations for money.

Enforce one wallet per user per tenant and currency where applicable.

## Wallet ledger model

Fields:
- _id
- tenantId
- walletId
- userId
- transactionId
- transferId
- entryType
- amountMinor
- balanceBeforeMinor
- balanceAfterMinor
- reference
- idempotencyKey
- createdAt

Use an append-only, auditable ledger.

Never silently modify or delete financial ledger entries.

Implement reversals using compensating entries.

## Transaction model

Fields:
- _id
- tenantId
- userId
- walletId
- serviceType
- amountMinor
- status
- providerId
- providerTransactionId
- idempotencyKey
- failureReason
- createdAt
- updatedAt

Supported transaction statuses:

PENDING
PROCESSING
SUCCESS
FAILED
REFUNDED

Add explicit state transition rules.

## Commission models

Support tenant-specific commission configuration.

Commission rules should include:
- tenantId
- serviceType
- operatorId
- beneficiaryRole
- calculationType
- commissionValue
- effectiveFrom
- effectiveTo
- status

Commission records should include:
- tenantId
- transactionId
- beneficiaryUserId
- sourceUserId
- amountMinor
- status
- createdAt

Support percentage and fixed commissions.

Define whether a commission rule represents a direct payout or a cumulative commission tier.

Never assume commission percentages can simply be added together.

Enforce commission budget constraints.

Make commission processing idempotent.

# 7. USER HIERARCHY MANAGEMENT

Implement user creation and management services.

When a Super Admin creates a Distributor:

- Distributor belongs to the same tenant.
- parentId references the Super Admin.
- createdBy references the creator.
- Create an associated wallet atomically.

When a Distributor creates a Retailer:

- Retailer belongs to the Distributor's tenant.
- parentId references the Distributor.
- createdBy references the Distributor.
- Create an associated wallet atomically.

When a Super Admin directly creates a Retailer:

- Retailer belongs to the Super Admin's tenant.
- parentId references the Super Admin.
- createdBy references the Super Admin.

Required APIs:

POST /api/users/distributors

POST /api/users/retailers

GET /api/users

GET /api/users/:id

PATCH /api/users/:id

PATCH /api/users/:id/status

GET /api/users/downline

GET /api/users/:id/downline

Implement pagination, filtering, sorting, and safe field selection.

Restrict management to authorized tenant users and valid downline relationships.

# 8. AUTHENTICATION AND AUTHORIZATION

Implement:

- Login
- Logout
- Refresh token
- Current profile
- Change password
- Password reset flow
- Session revocation
- Role-based access control
- Tenant-based authorization
- Downline-based authorization

Use short-lived access tokens.

Use rotating refresh tokens stored securely and revocably.

Use HTTP-only, Secure cookies where appropriate.

Implement CSRF protection for cookie-authenticated state-changing requests.

Implement secure password hashing with Argon2id.

Add login rate limiting and audit logging.

Do not implement public Developer registration.

Seed the initial Developer through a protected CLI bootstrap command.

Never log passwords, tokens, API keys, or other secrets.

# 9. WALLET MANAGEMENT

Implement:

- Wallet creation
- Balance inquiry
- Wallet transaction history
- Wallet funding requests
- Wallet transfers
- Wallet reversal
- Wallet blocking
- Ledger reporting

Required APIs:

GET /api/wallet

GET /api/wallet/ledger

POST /api/wallet/transfers

GET /api/wallet/transfers

POST /api/wallet/funding-requests

Use MongoDB transactions for financial operations.

Prevent negative balances and double spending.

Use atomic conditional updates, idempotency keys, and transaction sessions.

Do not permit arbitrary balance modification.

Use explicit authorized funding and adjustment workflows.

Implement safe retries and recovery.

MongoDB transaction support must be configured for a replica set, including local development.

# 10. RECHARGE AND BILL PAYMENT MODULE

Implement a modular provider integration architecture.

Supported service categories:

- Mobile prepaid recharge
- DTH recharge
- Postpaid payments
- Electricity payments
- BBPS-compatible bill payment workflows

Use a provider adapter interface.

Provider operations should include:
- Submit transaction
- Check transaction status
- Validate provider response
- Handle callback/webhook
- Normalize errors
- Reconcile pending transactions

Create a fully functional MOCK provider for development and automated tests.

Do not invent real third-party API endpoints or credentials.

Real providers must use documented integrations and environment-based credentials.

A provider should be replaceable without rewriting business logic.

Implement the recharge flow:

1. Authenticate Retailer.
2. Resolve tenant.
3. Validate user permissions.
4. Validate service and operator.
5. Validate amount.
6. Validate idempotency key.
7. Check wallet balance.
8. Reserve or debit funds atomically.
9. Create recharge order.
10. Queue provider submission.
11. Submit request through provider adapter.
12. Process success, failure, or pending response.
13. Finalize transaction safely.
14. Calculate eligible commissions.
15. Credit commissions idempotently.
16. Refund or release funds when appropriate.
17. Update reports and notifications.

Never hold a MongoDB transaction open while waiting for an external provider API.

Use a durable state machine, outbox pattern where appropriate, and recovery workers.

Handle ambiguous provider responses carefully.

Do not automatically refund a transaction merely because the provider request timed out.

# 11. COMMISSION DISTRIBUTION

Implement a configurable commission engine.

Possible beneficiaries:

- Retailer
- Distributor
- Super Admin

No Master Distributor.

For a Retailer under a Distributor:

Retailer -> Distributor -> Super Admin

For a Retailer directly under a Super Admin:

Retailer -> Super Admin

Determine beneficiaries from the actual user hierarchy.

Support:
- Fixed commissions
- Percentage commissions
- Operator-specific rules
- Service-specific rules
- Tenant-specific rules
- Commission reports
- Commission reversals
- Commission payout ledger entries

Use an explicitly documented calculation policy.

Provide tests for direct Retailers and Distributor-managed Retailers.

Do not credit commissions twice.

# 12. SUBSCRIPTIONS AND SAAS BILLING

Developer must be able to:

- Create subscription plans
- Assign plans to tenants
- Activate subscriptions
- Renew subscriptions
- Suspend expired subscriptions
- Set subscription start and end dates
- Configure plan features
- View subscription history

Create APIs under:

/api/platform/plans

/api/platform/tenants

/api/platform/subscriptions

Implement tenant suspension checks without corrupting pending financial operations.

# 13. REPORTS AND DASHBOARDS

Developer dashboard:
- Total tenants
- Active tenants
- Suspended tenants
- Subscription overview
- Platform transaction summary

Super Admin dashboard:
- Total Distributors
- Total Retailers
- Total recharge volume
- Successful transactions
- Failed transactions
- Tenant commissions
- Wallet summaries

Distributor dashboard:
- Total Retailers
- Downline recharge volume
- Commission earnings
- Wallet balance

Retailer dashboard:
- Wallet balance
- Recharge history
- Transaction status
- Commission earnings

Use efficient MongoDB aggregation pipelines.

Always apply tenant and permission filters.

# 14. SECURITY REQUIREMENTS

Implement:

- Strict tenant isolation
- Secure authentication
- RBAC
- Downline authorization
- Input validation
- Rate limiting
- Request size limits
- Security headers
- Tenant-aware CORS
- CSRF protection where needed
- Secure secret management
- Structured audit logging
- Provider webhook signature validation
- Replay attack prevention
- Idempotency
- Secure error handling
- Safe MongoDB query construction
- NoSQL injection protection

Do not return stack traces or internal secrets in production.

Never allow direct modification of wallet balances through generic user update APIs.

Do not expose password hashes.

Use least-privilege database credentials.

# 15. API DOCUMENTATION

Generate complete Swagger / OpenAPI documentation.

Document:
- Authentication
- Tenant provisioning
- Domain management
- User management
- Wallets
- Wallet transfers
- Recharge
- Bill payments
- Commission rules
- Commission records
- Subscriptions
- Reports
- Notifications
- Support tickets

Include request and response schemas, error responses, and authentication requirements.

# 16. PROJECT STRUCTURE

Use a modular structure similar to:

src/
  config/
  constants/
  database/
  models/
  middleware/
  modules/
    auth/
    platform/
    tenants/
    domains/
    users/
    wallets/
    recharges/
    bill-payments/
    commissions/
    subscriptions/
    reports/
    notifications/
    support/
  providers/
    interfaces/
    mock/
    integrations/
  queues/
  workers/
  utils/
  validators/
  types/
  app.ts
  server.ts

Each module should separate routes, controllers, services, validation, and data-access responsibilities.

Avoid placing business logic directly in controllers.

# 17. TESTING

Write meaningful automated tests for:

- Developer provisioning a tenant
- Super Admin creating a Distributor
- Super Admin creating a Retailer directly
- Distributor creating a Retailer
- Distributor attempting to create a Distributor (reject)
- Retailer attempting to create users (reject)
- Cross-tenant access attempts (reject)
- Unauthorized downline access (reject)
- Invalid domain resolution
- Tenant suspension
- Duplicate wallet transfers
- Concurrent wallet debits
- Insufficient wallet balance
- Recharge success
- Recharge failure
- Recharge timeout
- Duplicate provider callbacks
- Commission calculations
- Commission reversal
- Refund idempotency
- Refresh token rotation

Use a test database isolated from development and production.

# 18. DEVOPS AND ENVIRONMENT

Create:

- Dockerfile
- docker-compose.yml
- .env.example
- .gitignore
- tsconfig.json
- ESLint configuration
- package scripts
- Health check endpoint
- Readiness endpoint
- Graceful shutdown handling
- Database connection setup
- MongoDB indexes initialization
- Development seed scripts

Use MongoDB replica-set mode for local transaction testing.

Never commit actual secrets.

# 19. DOCUMENTATION

Create:

README.md

docs/ARCHITECTURE.md

docs/DATABASE.md

docs/API_SPEC.md

docs/RBAC.md

docs/TENANT_RESOLUTION.md

docs/WALLET_AND_LEDGER.md

docs/RECHARGE_FLOW.md

docs/COMMISSION_ENGINE.md

docs/DEPLOYMENT.md

docs/SECURITY.md

docs/TESTING.md

Document assumptions, tradeoffs, known limitations, and any external integrations requiring credentials.

# 20. IMPLEMENTATION INSTRUCTIONS

Work in the following phases:

Phase 1:
Inspect the repository, establish architecture, initialize project configuration, and implement MongoDB connectivity.

Phase 2:
Implement Tenant, TenantDomain, User, authentication, RBAC, and tenant resolution.

Phase 3:
Implement role hierarchy, user provisioning, downline authorization, and user management.

Phase 4:
Implement Wallet, WalletLedger, wallet transfers, and atomic financial operations.

Phase 5:
Implement recharge providers, mock provider, transaction state machine, and background workers.

Phase 6:
Implement commission rules, commission calculation, settlement, and reversals.

Phase 7:
Implement subscriptions, reports, tenant settings, notifications, and support tickets.

Phase 8:
Implement API documentation, integration tests, security hardening, Docker, and deployment documentation.

At the end of each phase:
- List created and modified files.
- Run TypeScript checks.
- Run relevant tests.
- Fix identified failures.
- Report what is complete.
- Report blockers and remaining work.

Continue through the phases when possible.

Do not claim a feature is complete unless implemented and verified.

Do not claim real recharge or BBPS integrations work without actual provider credentials and successful integration testing.

# 21. FINAL ACCEPTANCE CRITERIA

The project is ready for handoff when:

- All four roles work correctly.
- Master Distributor does not exist.
- Developer can provision multiple tenants.
- Tenants can operate on separate custom domains.
- One shared backend supports multiple tenants.
- Super Admin can create Distributors and Retailers.
- Distributor can create Retailers only.
- Retailer cannot create users.
- Tenant isolation is enforced.
- Wallet transfers are atomic and idempotent.
- Recharge works end-to-end with the mock provider.
- Commission processing works and is idempotent.
- Subscription management works.
- Reports enforce role permissions.
- Swagger documentation is available.
- Docker development environment starts successfully.
- TypeScript checks and automated tests pass.
- No hardcoded credentials exist.
- Known limitations and real provider integration requirements are documented.

Start by inspecting the existing repository. Then implement the complete backend systematically.

Do not stop after generating a project structure or database models. Build the working application.
