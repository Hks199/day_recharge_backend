import { z } from 'zod';
import { person } from './validators/index.js';
import { provisionInput } from './modules/platform/service.js';
import { rechargeInput } from './modules/recharges/validation.js';
import { websiteInput } from './modules/website/schema.js';
import { uploadInput } from './modules/website/uploads.js';
type Json = Record<string, unknown>;
const str = { type: 'string' }, id = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }, date = { type: 'string', format: 'date-time' };
const money = { type: 'integer', minimum: 0, maximum: 1_000_000_000_000, description: 'INR paise, integer only.' };
const obj = (properties: Json, required: string[] = []): Json => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const arr = (items: Json): Json => ({ type: 'array', items });
const enumeration = (...values: string[]) => ({ type: 'string', enum: values });
const service = enumeration('MOBILE', 'DTH', 'POSTPAID', 'ELECTRICITY', 'BBPS');
const serialize = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' });
const timestamps = { createdAt: date, updatedAt: date };
const base = { _id: id, tenantId: id, ...timestamps };
const schemas: Record<string, Json> = {
  Error: obj({ error: obj({ code: str, issues: arr(obj({ path: arr({}), message: str })) }, ['code']), requestId: str }, ['error', 'requestId']),
  PersonInput: serialize(person), ProvisionInput: serialize(provisionInput), RechargeInput: serialize(rechargeInput),
  User: obj({ ...base, tenantId: { ...id, nullable: true }, name: str, email: { type: 'string', format: 'email' }, phone: str, role: enumeration('DEVELOPER', 'SUPER_ADMIN', 'DISTRIBUTOR', 'RETAILER'), parentId: { ...id, nullable: true }, createdBy: { ...id, nullable: true }, status: enumeration('ACTIVE', 'BLOCKED'), lastLoginAt: date }),
  Branding: obj({ logo: { type: 'string', format: 'uri' }, primaryColor: str, secondaryColor: str }),
  Tenant: obj({ ...base, name: str, slug: str, ownerId: id, status: enumeration('ACTIVE', 'SUSPENDED'), branding: ref('Branding'), contactDetails: obj({ email: str, phone: str }), subscriptionId: id }),
  PublicConfig: obj({ name: str, logo: str, primaryColor: str, secondaryColor: str, domain: str, features: arr(str), support: obj({ email: str, phone: str }) }),
  SessionResult: obj({ accessToken: str, expiresIn: { type: 'integer' }, csrfToken: str, user: obj({ id, name: str, role: str, tenantId: { ...id, nullable: true } }), requestId: str }),
  Wallet: obj({ ...base, userId: id, currency: enumeration('INR'), balanceMinor: money, status: enumeration('ACTIVE', 'BLOCKED') }),
  Ledger: obj({ ...base, walletId: id, userId: id, transactionId: id, transferId: id, entryType: str, amountMinor: money, balanceBeforeMinor: money, balanceAfterMinor: money, reference: str, idempotencyKey: str }),
  Transfer: obj({ ...base, fromUserId: id, toUserId: id, amountMinor: money, idempotencyKey: str, reversedAt: date, reversedBy: id }),
  Funding: obj({ ...base, userId: id, amountMinor: money, reference: str, status: enumeration('REQUESTED', 'APPROVED', 'REJECTED'), decidedBy: id, decidedAt: date }),
  Transaction: obj({ ...base, userId: id, walletId: id, serviceType: service, operatorId: id, amountMinor: money, status: enumeration('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED'), providerId: id, providerTransactionId: str, idempotencyKey: str, failureReason: str, commissionBudgetMinor: money }),
  Operator: obj({ _id: id, ...timestamps, name: str, code: str, serviceType: service, providerId: id, minMinor: money, maxMinor: money, enabled: { type: 'boolean' } }),
  Provider: obj({ _id: id, ...timestamps, name: str, code: str, enabled: { type: 'boolean' }, credentialEnvPrefix: str }),
  Bill: obj({ ...base, userId: id, operatorId: id, accountHash: str, amountMinor: money, providerReference: str, expiresAt: date, consumedAt: date }),
  Rule: obj({ ...base, serviceType: service, operatorId: id, beneficiaryRole: str, calculationType: str, commissionValue: money, effectiveFrom: date, effectiveTo: date, status: str }),
  Commission: obj({ ...base, transactionId: id, beneficiaryUserId: id, sourceUserId: id, amountMinor: money, status: enumeration('PAID', 'REVERSED') }),
  Plan: obj({ _id: id, ...timestamps, name: str, priceMinor: money, durationDays: { type: 'integer' }, features: arr(str), active: { type: 'boolean' } }),
  Subscription: obj({ ...base, planId: id, startAt: date, endAt: date, status: enumeration('ACTIVE', 'EXPIRED', 'CANCELLED') }),
  Domain: obj({ ...base, hostname: str, verifiedAt: date, primary: { type: 'boolean' } }),
  DomainChallenge: obj({ id, hostname: str, txtName: str, txtValue: str }),
  Settings: obj({ ...base, enabledServices: arr(service), publicFeatures: arr(str), supportEmail: str, supportPhone: str }),
  Audit: obj({ ...base, actorId: id, action: str, targetId: str, requestId: str }),
  Notification: obj({ ...base, userId: id, title: str, message: str, readAt: date, reference: str }),
  Ticket: obj({ ...base, userId: id, subject: str, message: str, status: enumeration('OPEN', 'CLOSED'), response: str }),
  Dashboard: obj({ users: arr(obj({ _id: str, count: { type: 'integer' } })), transactions: arr(obj({ _id: str, count: { type: 'integer' }, volumeMinor: money })), commissions: arr(obj({ _id: str, amountMinor: money })), wallets: arr(obj({ _id: str, balanceMinor: money })) }),
  PlatformDashboard: obj({ tenants: arr(obj({ _id: str, count: { type: 'integer' } })), subscriptions: arr(obj({ _id: str, count: { type: 'integer' } })), transactions: arr(obj({ _id: str, count: { type: 'integer' }, volumeMinor: money })) })
};
const paths: Record<string, Record<string, unknown>> = {};
type Options = { public?: boolean; code?: number; paged?: boolean; list?: boolean; csrf?: boolean; idem?: boolean; filters?: string[] };
function route(method: string, path: string, summary: string, response: Json, body?: Json, options: Options = {}) {
  const parameters: Json[] = Array.from(path.matchAll(/\{(\w+)\}/g), match => ({ name: match[1], in: 'path', required: true, schema: id }));
  if (options.paged) for (const name of ['page', 'limit']) parameters.push({ name, in: 'query', schema: { type: 'integer', minimum: 1, ...(name === 'limit' ? { maximum: 100 } : {}) } });
  if (options.idem) parameters.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[\\w.-]+$' } });
  if (options.csrf) parameters.push({ name: 'X-CSRF-Token', in: 'header', required: true, schema: str });
  for (const name of options.filters ?? []) parameters.push({ name, in: 'query', schema: str });
  const result = options.list ? arr(response) : options.paged ? obj({ data: arr(response), total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, sort: str, direction: str }) : response;
  const status = options.code ?? 200;
  const responses: Record<string, Json> = { [status]: { description: status === 204 ? 'Completed' : 'Success', ...(status !== 204 ? { content: { 'application/json': { schema: result } } } : {}) } };
  for (const code of [400, 401, 403, 404, 409, 413, 429, 500, 503]) responses[code] = { description: ({ 400: 'Invalid input', 401: 'Invalid or revoked authentication', 403: 'Tenant, CSRF, role or downline forbidden', 404: 'Resource not visible or domain unknown', 409: 'Conflict or insufficient funds', 413: 'Request too large', 429: 'Rate limited', 500: 'Internal error', 503: 'Dependency unavailable' } as Record<number, string>)[code], content: { 'application/json': { schema: ref('Error') } } };
  paths[path] ??= {};
  paths[path][method] = { summary, tags: [path.includes('/platform') ? 'Platform' : path.split('/')[2] ?? 'Health'], security: options.public ? [] : options.csrf ? [{ refreshCookie: [] }] : [{ bearerAuth: [] }], parameters, ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}), responses };
}
for (const path of ['/health', '/ready']) route('get', path, path === '/ready' ? 'MongoDB and Redis readiness' : 'Process liveness', obj({ status: str }), undefined, { public: true });
route('get', '/api/public/tenant-config', 'Public branding from verified domain; active subscription required', ref('PublicConfig'), undefined, { public: true });
for (const prefix of ['/api', '/api/platform']) route('get', `${prefix}/public/website`, 'Public website branding and content; domain scoped', obj({ revision: { type: 'integer' }, brand: obj({}), values: obj({}) }), undefined, { public: true });
for (const prefix of ['/api/tenant', '/api/platform']) {
  route('get', `${prefix}/website`, 'Owner reads website and editable field definitions', obj({}));
  route('patch', `${prefix}/website`, 'Owner publishes website; stale revision returns 409', obj({}), serialize(websiteInput));
  route('post', `${prefix}/website/images/upload`, 'Owner requests a scoped S3 POST upload valid for 120 seconds; maximum image size 5 MB', obj({ url: str, fields: obj({}), publicUrl: str, expiresIn: { type: 'integer' } }), serialize(uploadInput));
}
for (const prefix of ['/api/auth', '/api/platform/auth']) {
  route('post', `${prefix}/login`, 'Login and set HTTP-only refresh cookie', ref('SessionResult'), obj({ email: { type: 'string', format: 'email' }, password: str }, ['email', 'password']), { public: true });
  route('post', `${prefix}/refresh`, 'Rotate refresh cookie; reuse revokes token family', ref('SessionResult'), undefined, { csrf: true });
  route('post', `${prefix}/logout`, 'Revoke session family', {}, undefined, { csrf: true, code: 204 });
  route('get', `${prefix}/me`, 'Read authenticated profile', ref('User'));
  route('patch', `${prefix}/me`, 'Update own name and phone', ref('User'), obj({ name: str, phone: str }));
  route('post', `${prefix}/change-password`, 'Change password and revoke sessions', {}, obj({ oldPassword: str, newPassword: { type: 'string', minLength: 12, maxLength: 128 } }, ['oldPassword', 'newPassword']), { code: 204 });
  route('delete', `${prefix}/sessions`, 'Revoke all own sessions', {}, undefined, { code: 204 });
  route('post', `${prefix}/password-reset/request`, 'Request password reset through configured delivery service', obj({ message: str }), obj({ email: { type: 'string', format: 'email' } }, ['email']), { public: true, code: 202 });
  route('post', `${prefix}/password-reset/confirm`, 'Consume reset token and revoke sessions', {}, obj({ token: { type: 'string', minLength: 64, maxLength: 64 }, password: { type: 'string', minLength: 12, maxLength: 128 } }, ['token', 'password']), { public: true, code: 204 });
}
for (const role of ['distributors', 'retailers']) route('post', `/api/users/${role}`, role === 'distributors' ? 'Super Admin creates Distributor' : 'Super Admin or Distributor creates Retailer', ref('User'), ref('PersonInput'), { code: 201 });
route('get', '/api/users', 'Read authorized tenant users', ref('User'), undefined, { paged: true, filters: ['role', 'status', 'sort', 'direction'] });
for (const path of ['/api/users/downline', '/api/users/{id}/downline']) route('get', path, 'Read authorized direct children', ref('User'), undefined, { paged: true });
route('get', '/api/users/{id}', 'Read self or authorized tenant user', ref('User'));
route('patch', '/api/users/{id}', 'Manage downline profile; role and balance changes rejected', ref('User'), obj({ name: str, phone: str }));
route('patch', '/api/users/{id}/status', 'Block or activate authorized downline', ref('User'), obj({ status: enumeration('ACTIVE', 'BLOCKED') }, ['status']));
route('get', '/api/wallet', 'Read own INR wallet', ref('Wallet'));
route('get', '/api/wallet/ledger', 'Read own or authorized downline ledger', ref('Ledger'), undefined, { paged: true, filters: ['userId'] });
route('post', '/api/wallet/transfers', 'Atomic transfer to authorized downline', ref('Transfer'), obj({ toUserId: id, amountMinor: money }, ['toUserId', 'amountMinor']), { code: 201, idem: true });
route('get', '/api/wallet/transfers', 'Read visible transfers', ref('Transfer'), undefined, { paged: true });
route('post', '/api/wallet/transfers/{id}/reverse', 'Super Admin reverses transfer using compensating entries', ref('Transfer'));
route('patch', '/api/wallet/{userId}/status', 'Super Admin blocks or activates wallet', ref('Wallet'), obj({ status: enumeration('ACTIVE', 'BLOCKED') }, ['status']));
route('post', '/api/wallet/funding-requests', 'Request funding with unique external bank reference', ref('Funding'), obj({ amountMinor: money, reference: { type: 'string', minLength: 8, maxLength: 100 } }, ['amountMinor', 'reference']), { code: 201 });
route('get', '/api/wallet/funding-requests', 'Read funding requests', ref('Funding'), undefined, { list: true, paged: true });
route('post', '/api/wallet/funding-requests/{id}/decision', 'Super Admin approves externally verified downline funding; self approval forbidden', ref('Funding'), obj({ approve: { type: 'boolean' } }, ['approve']));
for (const prefix of ['/api/recharges', '/api/bill-payments']) {
  route('post', prefix, 'Retailer reserves funds and queues payment', ref('Transaction'), ref('RechargeInput'), { code: 202, idem: true });
  route('get', prefix, 'Read scoped payment history', ref('Transaction'), undefined, { paged: true, filters: ['status', 'from', 'to'] });
  route('get', `${prefix}/operators`, 'Read enabled operators', ref('Operator'), undefined, { list: true });
  route('get', `${prefix}/{id}`, 'Read scoped payment status', ref('Transaction'));
  route('post', `${prefix}/{id}/reverse`, 'Super Admin records confirmed provider reversal; reverses commissions and principal', ref('Transaction'), obj({ reason: { type: 'string', minLength: 10, maxLength: 300 }, providerReversalConfirmed: { type: 'boolean', enum: [true] } }, ['reason', 'providerReversalConfirmed']));
}
route('post', '/api/bill-payments/inquiries', 'Fetch mock bill; single-use reference expires in 15 minutes', ref('Bill'), obj({ operatorId: id, account: str }, ['operatorId', 'account']), { code: 201 });
route('post', '/api/commissions/rules', 'Super Admin creates budget-checked direct payout rule', ref('Rule'), obj({ serviceType: service, operatorId: id, beneficiaryRole: enumeration('RETAILER', 'DISTRIBUTOR', 'SUPER_ADMIN'), calculationType: enumeration('FIXED', 'PERCENTAGE'), commissionValue: { type: 'integer', minimum: 0, maximum: 10000, description: 'FIXED: paise. PERCENTAGE: basis points. Owner wallet funds direct payouts.' }, effectiveFrom: date, effectiveTo: date }, ['serviceType', 'operatorId', 'beneficiaryRole', 'calculationType', 'commissionValue', 'effectiveFrom']), { code: 201 });
route('get', '/api/commissions/rules', 'Super Admin reads rules', ref('Rule'), undefined, { list: true, paged: true });
route('patch', '/api/commissions/rules/{id}', 'Disable rule without modifying transaction snapshots', ref('Rule'), obj({ status: enumeration('INACTIVE') }, ['status']));
route('get', '/api/commissions/records', 'Read own earnings; Super Admin sees all tenant records', ref('Commission'), undefined, { list: true, paged: true });
route('get', '/api/reports/dashboard', 'Tenant and hierarchy scoped aggregates', ref('Dashboard'));
route('get', '/api/notifications', 'Read own notifications', ref('Notification'), undefined, { list: true, paged: true });
route('patch', '/api/notifications/{id}/read', 'Mark own notification read', ref('Notification'));
route('post', '/api/support-tickets', 'Create support ticket', ref('Ticket'), obj({ subject: { type: 'string', minLength: 5, maxLength: 150 }, message: { type: 'string', minLength: 10, maxLength: 5000 } }, ['subject', 'message']), { code: 201 });
route('get', '/api/support-tickets', 'Read own tickets; Super Admin reads tenant tickets', ref('Ticket'), undefined, { list: true, paged: true });
route('patch', '/api/support-tickets/{id}', 'Super Admin responds to ticket', ref('Ticket'), obj({ status: enumeration('OPEN', 'CLOSED'), response: str }, ['status', 'response']));
route('get', '/api/tenant', 'Super Admin reads own tenant', ref('Tenant'));
route('patch', '/api/tenant/branding', 'Super Admin updates branding', ref('Branding'), ref('Branding'));
route('get', '/api/tenant/settings', 'Read operational settings', ref('Settings'));
route('patch', '/api/tenant/settings', 'Configure services and support contacts', ref('Settings'), obj({ enabledServices: arr(service), supportEmail: { type: 'string', format: 'email' }, supportPhone: str }, ['enabledServices']));
for (const prefix of ['/api/tenant/domains', '/api/platform/tenants/{id}/domains']) {
  const parameter = prefix.includes('platform') ? 'domainId' : 'id';
  route('post', prefix, 'Add explicit hostname and obtain DNS TXT challenge', ref('DomainChallenge'), obj({ hostname: { type: 'string', maxLength: 253 } }, ['hostname']), { code: 201 });
  route('post', `${prefix}/{${parameter}}/verify`, 'Verify actual DNS TXT ownership', obj({ id, hostname: str, verifiedAt: date }));
  route('patch', `${prefix}/{${parameter}}/primary`, 'Set verified primary hostname transactionally', ref('Domain'));
}
route('get', '/api/tenant/domains', 'List tenant domains', ref('Domain'), undefined, { list: true });
route('delete', '/api/tenant/domains/{id}', 'Remove non-primary domain', {}, undefined, { code: 204 });
const plan = obj({ name: str, priceMinor: money, durationDays: { type: 'integer', minimum: 1, maximum: 3660 }, features: arr(str) }, ['name', 'priceMinor', 'durationDays', 'features']);
route('get', '/api/platform/plans', 'Developer reads plans', ref('Plan'), undefined, { list: true });
route('post', '/api/platform/plans', 'Developer creates plan', ref('Plan'), plan, { code: 201 });
route('patch', '/api/platform/plans/{id}', 'Developer updates plan', ref('Plan'), obj({ name: str, priceMinor: money, durationDays: { type: 'integer' }, features: arr(str), active: { type: 'boolean' } }));
route('post', '/api/platform/tenants', 'Developer provisions tenant, owner, wallet and subscription atomically', ref('Tenant'), ref('ProvisionInput'), { code: 201 });
route('get', '/api/platform/tenants', 'Developer lists tenants', ref('Tenant'), undefined, { paged: true });
route('get', '/api/platform/tenants/{id}', 'Developer reads tenant', ref('Tenant'));
route('patch', '/api/platform/tenants/{id}/status', 'Activate or suspend tenant; financial recovery continues', ref('Tenant'), obj({ status: enumeration('ACTIVE', 'SUSPENDED') }, ['status']));
route('post', '/api/platform/tenants/{id}/funding-requests/{fundingId}/decision', 'Developer approves externally verified tenant funding', ref('Funding'), obj({ approve: { type: 'boolean' } }, ['approve']));
route('post', '/api/platform/subscriptions', 'Assign or renew plan; preserve subscription history', ref('Subscription'), obj({ tenantId: id, planId: id, startAt: date, endAt: date }, ['tenantId', 'planId', 'startAt', 'endAt']), { code: 201 });
route('get', '/api/platform/subscriptions', 'Read subscription history', ref('Subscription'), undefined, { list: true, paged: true, filters: ['tenantId'] });
route('get', '/api/platform/providers', 'Read provider configuration without secrets', ref('Provider'), undefined, { list: true });
route('post', '/api/platform/providers', 'Configure supported MOCK provider', ref('Provider'), obj({ name: str, code: enumeration('MOCK'), enabled: { type: 'boolean' } }, ['name', 'code', 'enabled']), { code: 201 });
route('patch', '/api/platform/providers/{id}', 'Enable or disable new provider requests', ref('Provider'), obj({ enabled: { type: 'boolean' } }, ['enabled']));
route('post', '/api/platform/operators', 'Configure operator and commission budget', ref('Operator'), obj({ name: str, code: str, serviceType: service, providerId: id, minMinor: money, maxMinor: money, commissionBudgetBps: { type: 'integer', minimum: 0, maximum: 10000 } }, ['name', 'code', 'serviceType', 'providerId', 'minMinor', 'maxMinor', 'commissionBudgetBps']), { code: 201 });
route('get', '/api/platform/audit-logs', 'Read platform audit records', ref('Audit'), undefined, { list: true, paged: true });
route('get', '/api/platform/tenants/{id}/domains', 'Developer lists tenant domain mappings', ref('Domain'), undefined, { list: true });
route('delete', '/api/platform/tenants/{id}/domains/{domainId}', 'Developer removes non-primary tenant domain mapping', {}, undefined, { code: 204 });
const platformSettings = obj({ key: enumeration('GLOBAL'), enabledServices: arr(service), maxRechargeMinor: money, supportEmail: { type: 'string', format: 'email' } }, ['enabledServices', 'maxRechargeMinor']);
route('get', '/api/platform/settings', 'Developer reads platform service restrictions', { ...platformSettings, nullable: true });
route('patch', '/api/platform/settings', 'Developer configures platform service restrictions; pending settlement continues', platformSettings, platformSettings);
route('get', '/api/platform/dashboard', 'Read audited global aggregates', ref('PlatformDashboard'));
route('post', '/api/webhooks/mock', 'HMAC-SHA256(secret, timestamp + dot + raw JSON); timestamp within 5 minutes; unique event ID prevents replay', obj({ accepted: { type: 'boolean' }, duplicate: { type: 'boolean' } }), obj({ eventId: str, transactionId: id, result: obj({ status: enumeration('SUCCESS', 'FAILED', 'PENDING'), providerTransactionId: str, failureReason: str }, ['status', 'providerTransactionId']) }, ['eventId', 'transactionId', 'result']), { public: true });
(paths['/api/webhooks/mock']!.post as Json).parameters = ['X-Webhook-Timestamp', 'X-Webhook-Signature'].map(name => ({ name, in: 'header', required: true, schema: str }));
export const openapi = {
  openapi: '3.0.3', info: { title: 'Multi-Tenant Recharge SaaS', version: '1.0.0', description: 'Tenant routes require verified hostname. On configured shared API hosts use verified Origin or X-Tenant-Domain selector; tokens remain bound to tenant. Platform routes require platform host and Developer credentials. Money is INR paise. Percentages are basis points. MOCK payment adapter only; real recharge and BBPS integrations require documented providers and credentials.' },
  servers: [{ url: '/', description: 'Tenant host for tenant routes; platform host for platform routes' }], paths,
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, refreshCookie: { type: 'apiKey', in: 'cookie', name: 'refresh' } }, schemas }
};
