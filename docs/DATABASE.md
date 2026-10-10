# Database and indexes

Each collection has its own `src/models/*.model.ts` file. Shared field definitions live in `schema-helpers.ts`, and `src/models/index.ts` re-exports all models for existing imports.

MongoDB 8.2 replica set is required. `connectDatabase` refuses a standalone server. `npm run indexes` creates declared indexes without dropping existing indexes; use a controlled migration for incompatible index changes. Runtime production connections have autoIndex disabled.

| Collection | Scope / main constraint |
| --- | --- |
| users | tenantId nullable only for Developer; unique tenant/email; one Super Admin per tenant; indexed hierarchy |
| tenants | platform entity; unique slug; designated owner and current subscription |
| tenant_domains | tenant; globally unique normalized hostname; one primary domain per tenant |
| subscriptions | tenant; immutable historical assignment records with status and dates |
| subscription_plans | global; duration, price, public feature flags |
| wallets | tenant; unique tenant/user/currency; bounded safe integer balance |
| wallet_ledger | tenant; unique tenant/wallet/idempotency key; append only |
| wallet_transfers | tenant; unique tenant/sender/idempotency key; reversal metadata |
| transactions | tenant; unique tenant/user/idempotency key; indexed state and history |
| recharge_orders | tenant; unique transaction; private account; commission snapshot |
| recharge_providers | global; unique code; credential environment prefix only |
| recharge_operators | global; unique code; service, bounds and budget |
| commission_rules | tenant; indexed operator/role/effective date |
| commission_records | tenant; unique transaction/beneficiary; paid/reversed |
| tenant_settings | tenant; one per tenant |
| refresh_tokens | tenant or Developer null; unique hashed refresh token; family, CSRF hash, revocation, expiry TTL |
| audit_logs | nullable tenant; actor, action, target, request ID; indexed chronological scope |
| notifications | tenant/user; status messages and read timestamp |
| support_tickets | tenant/user; subject, message, response, status |
| idempotency_records | tenant/user/scope/key unique; request fingerprint and resource reference |
| provider_webhook_events | tenant; globally unique provider/event ID and exact payload fingerprint |
| reconciliation_records | tenant/transaction; provider check outcome and timestamp |
| password_resets | tenant or null; hashed single-use credential, expiry TTL; required for reset workflow |
| outbox | tenant; unique transaction; durable queue delivery recovery |
| funding_requests | tenant; unique external reference; recorded approver and decision |
| bill_inquiries | tenant/user; hashed account, provider reference, amount, expiry, single-use marker |
| platform_settings | global singleton; enabled service restrictions, maximum recharge amount and support contact |

Additional collections exist to persist password-reset credentials, atomic outbox delivery, explicit funding approval and bill inquiry validation. References use ObjectIds; use service boundaries rather than generic document mutation. User document validation verifies parent role and tenant inside the current transaction. Account numbers are not returned by normal queries. Deploy storage encryption and restricted database credentials; `select:false` is not encryption.

Do not grant public clients database access. Ledger mutation is rejected by model operations; enforce stronger production separation using database roles that give the ledger writer insert/find only, plus backup retention and database auditing. MongoDB administrators can bypass application guards, so operational controls are necessary.
