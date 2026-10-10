# Recharge and bill payment flow

1. Resolve active tenant and subscription, authenticate active Retailer and revocable session.
2. Validate strict service/operator/account/amount and idempotency key. Bill services require a fresh matching, unconsumed bill inquiry.
3. In one MongoDB transaction: compute direct commission snapshot from real hierarchy, check budget, debit principal, reserve owner-funded commission, create PENDING transaction, order, outbox and idempotency record. Consume bill inquiry atomically.
4. Worker dispatches outbox into BullMQ using the transaction ID as job ID. Only mark delivered after enqueue succeeds.
5. Submission acquires a 60-second order lease and atomically claims PENDING -> PROCESSING. Provider adapter executes outside database transaction. Redelivery/recovery checks status, avoiding blind resubmission. Real adapters must enforce network timeouts below the lease duration (or implement renewal for longer operations).
6. Definitive success finalizes SUCCESS and credits snapshotted commissions and notification in one MongoDB transaction. Definitive failure records FAILED and immediately refunds principal/reserves into REFUNDED. PENDING provider responses retain PROCESSING and reserved money.
7. Ambiguous exceptions/timeouts record reconciliation evidence and leave money reserved. Background recovery rechecks old PENDING/PROCESSING records. Tenant suspension never stops already committed settlement and refunds.

Transitions: PENDING -> PROCESSING -> SUCCESS or FAILED; SUCCESS or FAILED -> REFUNDED. Terminal callbacks cannot reverse a successful payment implicitly. Explicit Super Admin reversal requires confirmed provider reversal and a reason, then reverses commissions and refunds all reserves/principal transactionally. This administrative attestation must be supported by external reconciliation evidence; it does not call a real provider cancellation API.

Mock adapter: account ends 0000 => declined; 9999 => submission timeout then pending status; 8888 => pending; all others => success. Mock bill fetch returns 10,000 paise. Signed mock webhook resolves pending operations. HMAC SHA256 covers `timestamp + '.' + rawBody`, with a 5-minute tolerance, and persistent unique provider/event IDs. Event ID reuse with different raw payload conflicts.

A real provider must implement submit, status, validated response normalization, bill fetch, documented webhook verification and reconciliation. Use transaction ID as stable merchant reference and understand the provider's deduplication contract. Authoritative NOT_FOUND handling, fees, bill metadata, operator catalogue, reversals and settlement are provider-specific. There are no fake real endpoints. MOCK must remain disabled in production unless intentionally operating a demonstration environment.
