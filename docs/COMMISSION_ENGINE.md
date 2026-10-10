# Commission engine

Each rule is a **direct payout**, not a cumulative tier. Percentage values are integer basis points (100 = 1%). Fixed values are integer paise. Each payout is floored independently using BigInt. The actual hierarchy provides beneficiaries: Retailer -> Distributor -> designated Super Admin, or direct Retailer -> Super Admin. No synthetic intermediary is introduced.

Rules match tenant, operator, service and beneficiary role; active effective windows use the latest effectiveFrom (and ID as deterministic tie-break). Disable old rules to avoid overlapping schedules. Runtime snapshot checks the total payout against the platform operator's commissionBudgetBps. Rule creation also performs a conservative minimum-amount budget check using the largest configured role payout. Final runtime budget check is authoritative across all amounts and rounding.

At order creation, reserve the exact total commission from the tenant owner's wallet, separately from the Retailer's principal debit. This makes the funding source explicit and prevents creating unfunded commission liabilities. The owner's own eligible commission is paid from that reserve too. A funded owner wallet is needed when commissions are configured.

Order stores beneficiary IDs and amounts. Subsequent rule changes cannot alter in-flight orders. Success inserts unique transaction/beneficiary commission records, payout ledger entries and credits in the same transaction as success. Retrying a job or callback cannot credit twice. Failure releases the reserve without recording earnings.

Confirmed payment reversal debits all paid commissions, marks records REVERSED and refunds principal plus owner reserve in one database transaction. If any beneficiary has spent the commission, reversal fails without partial effects; recover externally or fund the relevant wallet through an approved deposit workflow, then retry. No negative wallet or silent financial edits are allowed.
