# Deployment

Use Node.js 24 and `npm ci` from the lockfile. Compile with `npm run build`. Runtime commands: `node dist/server.js` and `node dist/workers/main.js`. Initialize indexes as a controlled migration. Set separate cryptographically random JWT_SECRET and WEBHOOK_SECRET and rotate through the deployment secret manager. Do not commit `.env`.

Compose is a **local development** stack: unauthenticated single-node MongoDB replica set and Redis are exposed only on loopback. `mongo-init` waits for primary election before API/worker start. MongoDB and Redis volumes persist data. Never use `docker compose down -v` against data you need. For host-side Node connections use directConnection=true as explained in README.

Production requires a secured MongoDB replica set (or managed equivalent) with TLS, authenticated least-privilege credentials and backups. Redis must be private, authenticated and TLS-enabled as appropriate, use noeviction and durable storage. Replace Compose development connection strings with secret-managed endpoints. Do not expose MongoDB/Redis publicly. Test backup restoration and retain the immutable financial history.

Deploy API/worker image as non-root. Set NODE_ENV=production, COOKIE_SECURE=true, MOCK_PROVIDER_ENABLED=false, configured verified frontend domains and HTTPS platform origins. Set TRUSTED_PROXIES to exact edge peers. Deploy custom-domain routing and TLS as described in TENANT_RESOLUTION. Forward original validated host and overwrite forwarded headers. Shared frontend consumes public tenant config and keeps access/CSRF credentials in memory.

API liveness `/health` does not imply dependency readiness. `/ready` checks database and queue connectivity. Monitor worker heartbeat, BullMQ failed jobs, oldest pending transaction age, outbox age, reconciliation unknowns, ledger drift, subscription expiry, DNS/TLS expiry and funding evidence. Alert on pending orders rather than automatically refunding timeouts.

Graceful SIGTERM/SIGINT closes HTTP server, queue and MongoDB; workers drain active jobs. Set orchestrator termination grace above provider timeout and worker job duration. Rolling updates require adapter compatibility with in-flight orders. Pending settlements continue for suspended/expired tenants.

No real provider adapter, bank import, automated SaaS payment collection, GST invoicing or BBPS certification is included. Configure and test actual integrations before accepting live money. Password reset requires an internal delivery service with a bearer credential; POST payload is `{to,token,tenantId}`. The delivery service must construct the correct tenant-domain reset link, validate authorization and avoid logging tokens.
