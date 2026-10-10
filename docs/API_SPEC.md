# API contract

Complete machine-readable OpenAPI contract: GET `/api/openapi.json`. Interactive Swagger UI: `/api/docs`. Generated contract registry: `src/openapi.ts`. The contract includes all implemented business routes, request/response schemas, security requirements, pagination, idempotency and common error responses.

Tenant scope is resolved before auth from verified domains. Access tokens use `Authorization: Bearer <token>` and expire after 10 minutes. Login/refresh set a 30-day rotating HTTP-only refresh cookie and return csrfToken. Cookie refresh and logout require `X-CSRF-Token`. No public registration or role promotion exists. Developer authentication is under `/api/platform/auth` on configured platform hosts.

| Resource | Prefix |
| --- | --- |
| Tenant profile authentication | /api/auth |
| Public branding | /api/public/tenant-config |
| Platform plans/tenants/subscriptions/providers/operators/audit/dashboard | /api/platform |
| Tenant branding/domains/settings | /api/tenant |
| Hierarchy and downline | /api/users |
| Wallet/ledger/transfers/funding | /api/wallet |
| Recharge orders and status | /api/recharges |
| Bill inquiry and payment | /api/bill-payments |
| Commission rules/records | /api/commissions |
| Role-aware aggregate reports | /api/reports/dashboard |
| Notifications | /api/notifications |
| Support tickets | /api/support-tickets |
| Signed mock callback | /api/webhooks/mock |

Creation endpoints return 201, queued recharge/payment returns 202, delete/logout/password change return 204. Paginated user, transaction, ledger and transfer endpoints return `{data,total,page,limit,sort,direction}`. Other lists return arrays and support bounded page/limit where documented. Default page 1, limit 20, maximum 100. User lists accept role/status/sort/direction. Transactions accept status/from/to; dates use ISO 8601. Financial commands require 8–128 character Idempotency-Key containing letters, digits, underscore, dot or hyphen.

Normal errors: `{error:{code,issues?},requestId}`. 400 invalid input, 401 invalid/revoked credential, 403 role/tenant/downline/CSRF/subscription forbidden, 404 invisible resource/domain, 409 duplicate/key conflict/insufficient balance, 413 oversized body, 429 rate limited, 503 unconfigured integration or unavailable dependency. Validation issues omit submitted values. No stack traces or password hashes are returned. X-Request-ID accompanies responses. Middleware errors and dependency failures are normalized where possible; edge infrastructure can produce its own errors.
