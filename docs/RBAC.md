# Role and hierarchy permissions

| Operation | DEVELOPER | SUPER_ADMIN | DISTRIBUTOR | RETAILER |
| --- | --- | --- | --- | --- |
| Provision tenant/owner, plans, subscriptions, providers | Platform APIs | No | No | No |
| Create Distributor | No tenant impersonation | Own tenant | No | No |
| Create Retailer | No tenant impersonation | Own tenant | Direct child | No |
| Manage users | Explicit platform provisioning only | Own downline; owner protected | Direct Retailers | Read/update self profile |
| Transfer own funds | No tenant impersonation | Authorized downline | Direct Retailers | No |
| Approve external funding | Explicit audited tenant workflow | Downline; not self | No | No |
| Recharge/pay bills | No | No | No | Own wallet |
| Transaction reports | Explicit audited platform aggregates | Own tenant | Self/direct Retailers | Self |
| Commission earnings | Platform aggregates | Tenant | Own | Own |
| Branding/domains/settings/rules | Explicit domain administration | Own tenant | No | No |
| Support | No tenant impersonation | Own tenant tickets | Own tickets | Own tickets |

Developer is a platform scope, not a wildcard tenant token. Tenant APIs reject Developer tokens and mismatched tenant tokens. Creation stores actual creator and business parent separately, always creates the wallet in the same transaction, and validates parent roles. Roles, tenant IDs, parents, wallet balances and password hashes are not accepted by generic profile update endpoints.

GET `/api/users/:id/downline` returns direct children. Tenant-wide lists include descendants for Super Admin. Distributor access is limited to their direct Retailers. Unauthorized IDs yield 404 when outside tenant and 403 for unrelated hierarchy. No extra business role exists.
