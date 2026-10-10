# Wallet and ledger policy

INR uses integer paise. Requests reject fractional, non-positive, unsafe and oversized amounts. Wallet balances cannot exceed 1,000,000,000,000 paise; request amounts cannot exceed 1,000,000,000 paise. Percentage calculations use BigInt intermediate multiplication and integer floor. No floating-point percentage multiplication is used.

`moveMoney` performs an atomic conditional balance update and appends the before/after ledger in the same MongoDB session. Debit predicates require sufficient balance and an active wallet. Transfers insert one transfer record and a debit/credit pair atomically. If either side fails, all changes roll back. Driver withTransaction retries transient conflicts. There is no generic balance-edit API.

An idempotency record is scoped by tenant, acting user, operation and key. Payload fingerprint must match on reuse. Financial records and idempotency records commit together. Concurrent duplicates return the same resource; changed payloads conflict. Records are retained rather than expiring keys and unexpectedly allowing another debit.

Funding requests require a unique external bank reference. Developer approves owner deposits; Super Admin can approve actual externally verified downline deposits but cannot approve self. These privileged approvals create money inside this wallet system and must be reconciled with real external funds. A request is not evidence of payment. Approval decisions and ledger entries are atomic and repeat-safe. Never automate approval using an unverified client receipt.

Transfers may only target the sender's authorized downline. Reversal creates compensating entries. A reversal fails completely if the recipient no longer has enough money. Recharge failure refunds only after definitive provider failure. Signed callbacks and recoveries are idempotent. Operationally blocked wallets may receive mandatory refunds and commission settlement; blocking stops new debit/submission workflows, not completion of liabilities.

Ledger entries cannot be updated or deleted through supported model operations. Apply database-level insert/find privileges and administrator auditing for production immutability. Financial reconciliation compares ledger before/after chains, current balances, provider outcomes, reserves and external bank funding. Principal payment debit represents provider expense; commission reserves are funded separately by the tenant owner.
