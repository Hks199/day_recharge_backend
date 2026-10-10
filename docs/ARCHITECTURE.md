# Architecture

The API resolves a tenant from a verified hostname, checks tenant and subscription status, authenticates a revocable session and authorizes role/downline access. Platform APIs use a separate configured host and Developer scope. Controllers parse strict Zod inputs and delegate money, hierarchy, auth, domain and payment operations to services. Mongoose models supply typed fields, references and indexes. Small notification/support/config endpoints perform scoped CRUD directly in their route module.

All tenant business records carry tenantId. Plans, providers and operators are shared catalogues administered by the platform; Developer accounts have a null tenantId. The server reads business scope from the current authenticated user and resolved tenant, never an arbitrary body field. Platform endpoints deliberately accept explicit target tenants and audit platform operations.

MongoDB replica-set transactions group wallet changes, ledger entries and related records. Conditional updates prevent overdrafts. Operations inside a transaction run sequentially. BullMQ carries submission and reconciliation jobs; MongoDB outbox records are authoritative if Redis is unavailable. Enqueue precedes outbox delivery marking. Stable job IDs and idempotent consumers tolerate redelivery. Recovery scans PENDING and PROCESSING transactions even after suspension or subscription expiry.

External provider calls are outside database transactions. A process restart after an ambiguous submission checks provider status rather than submitting a second payment. A real adapter must distinguish authoritative non-submission from uncertain provider status and use the transaction ID as a provider idempotency reference. There is no universal exactly-once guarantee for third-party APIs.

The API and worker are separate processes and may scale independently. Shutdown stops HTTP acceptance and drains connections; the worker drains active jobs. Redis uses AOF and noeviction. Financial history never has automatic TTL deletion. Only expired sessions/reset credentials use TTL cleanup.

Design assumptions: INR only; one owner Super Admin per tenant; three-level maximum hierarchy; direct commissions funded by owner reserve; externally confirmed manual funding; catalogues shared globally. Production integrations and deployment gates are documented in README and DEPLOYMENT.
