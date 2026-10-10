# Tenant resolution and custom domains

Same-host deployment: reverse proxy serves frontend at `/` and forwards `/api` to the shared API. Express uses the direct request hostname unless the peer matches an explicitly configured trusted proxy IP/CIDR. Unknown or unverified domains fail closed.

Shared API deployment: only configured SHARED_API_HOSTS can use a tenant selector. A browser Origin must be an exact valid URL whose hostname has a verified mapping; native clients use X-Tenant-Domain with an exact verified hostname. These values select a tenant, but grant no authority: credentials must belong to that tenant, and authorization still applies on every resource query. Browser CORS only allows origins mapped to the same tenant. No user-supplied tenantId is trusted. Do not expose an arbitrary proxy rewrite that accepts client-forwarded host values.

PLATFORM_HOSTS serves platform authentication and administration. Configure PLATFORM_ORIGINS separately. Restrict platform origins in production to HTTPS. The Developer must use the platform login path and hostname.

Add each apex and www hostname independently. The service lowercases, removes a trailing dot, converts IDNs to ASCII, validates DNS label rules and rejects IP addresses, schemes, paths and ports. TXT challenge: `_recharge-verification.<hostname>` with the returned cryptographically random value. Only a successful DNS lookup matching that token sets verifiedAt. Marking primary requires verifiedAt. Remove requires non-primary status. Adding an already mapped hostname yields conflict globally.

Route each approved domain to the shared frontend/reverse proxy with A/AAAA or supported CNAME/ALIAS records. Provision TLS certificates per domain through an ownership-verified ACME process. Serve only known domains at the edge and renew certificates automatically. Configure a default proxy vhost that rejects unknown Host headers. Strip inbound X-Forwarded-* at the edge and set them from validated connection metadata. Add the edge's real IP/CIDR to TRUSTED_PROXIES; never use blanket `true` trust.

Shared API cookies use Secure, HttpOnly, SameSite=None; frontend requests use credentials include and retain CSRF tokens in memory. Browsers may block third-party cookies across unrelated domains. Prefer same-host `/api` reverse proxy where this occurs. API requests use bearer access tokens, while only refresh/logout authenticate via cookie and require CSRF.
