import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createHmac, randomBytes } from 'node:crypto';

// Ephemeral, isolated replica set; never use an environment-provided database in tests.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.WEBHOOK_SECRET = randomBytes(48).toString('hex');
process.env.MOCK_PROVIDER_ENABLED = 'true';
process.env.COOKIE_SECURE = 'false';
process.env.PLATFORM_HOSTS = 'platform.test';
process.env.PLATFORM_ORIGINS = 'http://platform.test';
process.env.SHARED_API_HOSTS = 'api.test';
process.env.LOG_LEVEL = 'silent';
process.env.S3_REGION = '';
process.env.S3_BUCKET = '';
process.env.S3_PUBLIC_BASE_URL = '';
process.env.PASSWORD_RESET_DELIVERY_URL = 'https://reset-delivery.test/send';
process.env.PASSWORD_RESET_DELIVERY_SECRET = randomBytes(48).toString('hex');

const { createApp } = await import('../src/app.js');
const { initializeIndexes } = await import('../src/database/index.js');
const models = await import('../src/models/index.js');
const { passwordHash } = await import('../src/modules/auth/service.js');
const { processRecharge } = await import('../src/modules/recharges/service.js');
const { verifyDomain } = await import('../src/modules/domains/service.js');
const { expireSubscriptions } = await import('../src/modules/platform/service.js');
const app = createApp();
let replica: MongoMemoryReplSet;
const secretPassword = 'Test-only-password-2026!';
type Identity = { id: string; token: string; host: string; csrf: string; cookie: string };
let developer: Identity, ownerA: Identity, ownerB: Identity, distributor: Identity, distributor2: Identity, retailer: Identity, directRetailer: Identity;
let tenantA: string, tenantB: string, planId: string, operatorId: string, billOperatorId: string;
let sequence = 0;
function person(name: string) { return { name, email: `${name.toLowerCase().replace(/\s/g, '')}@example.test`, phone: '+919876543210', password: secretPassword }; }
async function login(host: string, email: string, platform = false): Promise<Identity> {
  const result = await request(app).post(`/api/${platform ? 'platform/' : ''}auth/login`).set('Host', host).send({ email, password: secretPassword });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return { id: result.body.user.id as string, token: result.body.accessToken as string, csrf: result.body.csrfToken as string, cookie: String(result.headers['set-cookie']?.[0]).split(';')[0]!, host };
}
function api(identity: Identity, method: 'get' | 'post' | 'patch' | 'delete', path: string) { return request(app)[method](path).set('Host', identity.host).set('Authorization', `Bearer ${identity.token}`); }
async function create(identity: Identity, role: 'retailers' | 'distributors', name: string) {
  const result = await api(identity, 'post', `/api/users/${role}`).send(person(name)); expect(result.status, JSON.stringify(result.body)).toBe(201);
  expect(result.body.passwordHash).toBeUndefined(); return login(identity.host, person(name).email);
}
async function funding(identity: Identity, amountMinor: number) {
  const result = await api(identity, 'post', '/api/wallet/funding-requests').send({ amountMinor, reference: `bank-confirmed-${++sequence}` }); expect(result.status).toBe(201);
  const approved = await api(developer, 'post', `/api/platform/tenants/${identity.host === 'a.test' ? tenantA : tenantB}/funding-requests/${result.body._id}/decision`).send({ approve: true }); expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  return result.body._id as string;
}
async function balance(identity: Identity) { const response = await api(identity, 'get', '/api/wallet'); expect(response.status).toBe(200); return response.body.balanceMinor as number; }
async function recharge(account = '9876543210', amountMinor = 10000, identity = retailer, idempotency = `recharge-key-${++sequence}`) {
  return api(identity, 'post', '/api/recharges').set('Idempotency-Key', idempotency).send({ operatorId, serviceType: 'MOBILE', account, amountMinor });
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' }, binary: { version: '8.2.6' } });
  await mongoose.connect(replica.getUri('recharge_isolated_test'));
  await initializeIndexes();
  const developerData = person('Developer');
  await models.User.create({ name: developerData.name, email: developerData.email, phone: developerData.phone, passwordHash: await passwordHash(secretPassword), role: 'DEVELOPER' });
  developer = await login('platform.test', person('Developer').email, true);
  const plan = await api(developer, 'post', '/api/platform/plans').send({ name: 'Test Plan', priceMinor: 1000, durationDays: 30, features: ['mobile', 'bills'] }); expect(plan.status).toBe(201); planId = plan.body._id as string;
  const provider = await models.Provider.create({ name: 'Mock', code: 'MOCK', enabled: true });
  const operator = await models.Operator.create({ name: 'Mobile Mock', code: 'MOCK_MOBILE', serviceType: 'MOBILE', providerId: provider._id, minMinor: 1000, maxMinor: 1000000, commissionBudgetBps: 500 }); operatorId = String(operator._id);
  const billOperator = await models.Operator.create({ name: 'Bill Mock', code: 'MOCK_BBPS', serviceType: 'BBPS', providerId: provider._id, minMinor: 1000, maxMinor: 1000000, commissionBudgetBps: 500 }); billOperatorId = String(billOperator._id);
});
afterAll(async () => { await mongoose.disconnect(); if (replica) await replica.stop(); });

describe('Platform provisioning and verified domains', () => {
  it('provisions two isolated tenants and owner wallets atomically', async () => {
    for (const label of ['A', 'B']) {
      const result = await api(developer, 'post', '/api/platform/tenants').send({ name: `Tenant ${label}`, slug: `tenant-${label.toLowerCase()}`, planId, owner: person(`Owner${label}`) });
      expect(result.status, JSON.stringify(result.body)).toBe(201);
      const tenantId = result.body._id as string;
      if (label === 'A') tenantA = tenantId; else tenantB = tenantId;
      expect(await models.Wallet.countDocuments({ tenantId })).toBe(1);
      const domain = await api(developer, 'post', `/api/platform/tenants/${tenantId}/domains`).send({ hostname: `${label.toLowerCase()}.test` }); expect(domain.status).toBe(201);
      const unknown = await request(app).get('/api/public/tenant-config').set('Host', `${label.toLowerCase()}.test`); expect(unknown.status).toBe(404);
      await verifyDomain(tenantId, domain.body.id as string, async () => [[domain.body.txtValue as string]]);
      const primary = await api(developer, 'patch', `/api/platform/tenants/${tenantId}/domains/${domain.body.id}/primary`); expect(primary.status).toBe(200);
    }
    ownerA = await login('a.test', person('OwnerA').email); ownerB = await login('b.test', person('OwnerB').email);
  });
  it('rejects invalid/unknown domains, missing shared selectors and untrusted forwarded hosts', async () => {
    expect((await request(app).get('/api/public/tenant-config').set('Host', 'evil.test')).status).toBe(404);
    expect((await request(app).get('/api/public/tenant-config').set('Host', 'api.test')).status).toBe(400);
    expect((await request(app).get('/api/public/tenant-config').set('Host', 'evil.test').set('X-Forwarded-Host', 'a.test')).status).toBe(404);
    const result = await api(developer, 'post', `/api/platform/tenants/${tenantA}/domains`).send({ hostname: 'https://evil.com/path' }); expect(result.status).toBe(400);
  });
  it('resolves shared API origins and returns only public configuration', async () => {
    const response = await request(app).get('/api/public/tenant-config').set('Host', 'api.test').set('Origin', 'http://a.test'); expect(response.status).toBe(200); expect(response.body.name).toBe('Tenant A'); expect(response.body.ownerId).toBeUndefined();
    expect(response.headers['access-control-allow-origin']).toBe('http://a.test');
    expect((await request(app).get('/api/public/tenant-config').set('Host', 'a.test').set('Origin', 'http://b.test')).status).toBe(403);
  });
});
describe('Public website content', () => {
  it('serves backend defaults without writing on public reads and omits private metadata', async () => {
    for (const [host, prefix, name] of [['platform.test', '/api/platform', 'Day Recharge'], ['a.test', '/api', 'Tenant A']]) {
      const result = await request(app).get(`${prefix}/public/website`).set('Host', host!);
      expect(result.status).toBe(200); expect(result.body.brand.name).toBe(name);
      expect(result.body.values['home.h1.53']).toBe('Power Your Business');
      expect(result.body.fields).toBeUndefined(); expect(result.body._id).toBeUndefined();
    }
    expect(await models.WebsiteContent.countDocuments()).toBe(0);
    const editor = await api(developer, 'get', '/api/platform/website');
    expect(editor.status).toBe(200);
    expect(editor.body.fields).toHaveLength(Object.keys(editor.body.values).length - 2);
    expect(editor.body.fields.find((field: { key: string }) => field.key === 'home.h1.53')).toMatchObject({ label: 'Main headline', section: 'Welcome banner' });
    for (const field of editor.body.fields) {
      expect(field.label).not.toMatch(/^(h[1-6]|p|text|span|title|to|src|color|image|Link)$/);
      expect(field.section.length).toBeGreaterThan(0); expect(field.description.length).toBeGreaterThan(10);
      expect(Object.hasOwn(editor.body.values, field.key)).toBe(true);
    }
    expect(editor.body.fields.some((field: { key: string }) => field.key === 'terms.time.14')).toBe(false);
    expect((await request(app).get('/api/public/website').set('Host', 'evil.test')).status).toBe(404);
    expect((await request(app).get('/api/platform/public/website').set('Host', 'a.test')).status).toBe(404);
  });
  it('persists one indexed document, isolates tenants, validates writes, and prevents lost updates', async () => {
    const initial = await api(ownerA, 'get', '/api/tenant/website'); expect(initial.status).toBe(200);
    const { revision, brand, values } = initial.body;
    const payload = { revision, brand: { ...brand, name: 'Dynamic business', logo: '/images/recharge.png', authLogo: '/images/dth.png', support: { email: 'website@example.test', phone: '9876543210' } }, values: { ...values, 'home.h1.53': 'Backend controlled headline', 'terms.text.2': 'Dynamic terms for {{brand}}.' } };
    const writes = await Promise.all([api(ownerA, 'patch', '/api/tenant/website').send(payload), api(ownerA, 'patch', '/api/tenant/website').send(payload)]);
    expect(writes.map(r => r.status).sort()).toEqual([200,409]);
    const publicA = await request(app).get('/api/public/website').set('Host', 'a.test');
    expect(publicA.body.brand.name).toBe('Dynamic business'); expect(publicA.body.brand.logo).toBe('/images/recharge.png');
    expect(publicA.body.brand.authLogo).toBe(publicA.body.brand.logo);
    expect((await models.WebsiteContent.findById(`tenant:${tenantA}`).lean())?.brand.authLogo).toBeUndefined();
    expect(publicA.body.values['home.h1.53']).toBe('Backend controlled headline'); expect(publicA.body.revision).toBe(1);
    const publicB = await request(app).get('/api/public/website').set('Host', 'b.test'); expect(publicB.body.brand.name).toBe('Tenant B'); expect(publicB.body.values['home.h1.53']).toBe('Power Your Business');
    expect((await api({ ...ownerA, host: 'b.test' }, 'patch', '/api/tenant/website').send(payload)).status).toBe(403);
    expect((await request(app).patch('/api/tenant/website').set('Host', 'a.test').send(payload)).status).toBe(401);
    for (const bad of [
      { ...payload, tenantId: tenantB },
      { ...payload, brand: { ...brand, logo: 'javascript:alert(1)' } },
      { ...payload, brand: { ...brand, logo: 'https://dayrecharge.com/logo.png' } },
      { ...payload, values: { ...values, 'navigation.to.1': '//dayrecharge.com' } },
      { ...payload, values: { ...values, '$unknown': 'injected' } },
    ]) expect((await api(ownerA, 'patch', '/api/tenant/website').send(bad)).status).toBe(400);
    expect(await models.WebsiteContent.countDocuments()).toBe(1);
    expect((await api(ownerA, 'get', '/api/tenant/website')).body.revision).toBe(1);
    expect(await models.Audit.exists({ action: 'WEBSITE_UPDATE', tenantId: tenantA })).toBeTruthy();
  });
  it('keeps legacy branding and support updates synchronized and versioned', async () => {
    const before = await api(ownerA, 'get', '/api/tenant/website');
    expect((await api(ownerA, 'patch', '/api/tenant/branding').send({ logo: '/images/dth.png', primaryColor: '#123456', secondaryColor: '#654321' })).status).toBe(200);
    const settings = await api(ownerA, 'get', '/api/tenant/settings');
    expect((await api(ownerA, 'patch', '/api/tenant/settings').send({ enabledServices: settings.body.enabledServices, supportEmail: 'updated@example.test', supportPhone: '+919876543210' })).status).toBe(200);
    const after = await api(ownerA, 'get', '/api/tenant/website');
    expect(after.body.revision).toBe(before.body.revision + 2);
    expect(after.body.brand.logo).toBe('/images/dth.png'); expect(after.body.brand.authLogo).toBe('/images/dth.png');
    expect(after.body.brand.support.email).toBe('updated@example.test'); expect(after.body.values['home.h1.53']).toBe('Backend controlled headline');
    const legacyPublic = await request(app).get('/api/public/tenant-config').set('Host', 'a.test');
    expect(legacyPublic.body.name).toBe(after.body.brand.name); expect(legacyPublic.body.logo).toBe('/images/dth.png');
  });
  it('allows a developer to edit only the platform website', async () => {
    const initial = await api(developer, 'get', '/api/platform/website');
    const { revision, brand, values } = initial.body;
    expect(initial.body.fields.length).toBeGreaterThan(200);
    const updatedValues = { ...values, 'about.h2.11': 'Our updated story', 'contact.h2.10': 'Write to our team', 'privacy.text.2': 'Updated privacy content', 'footer.p.3': 'Updated footer', 'navigation.label.4': 'Our story', 'auth.text.3': 'Welcome to your business', 'terms.dateTime.13': '2027-01-01', 'privacy.dateTime.11': '2027-02-02' };
    const saved = await api(developer, 'patch', '/api/platform/website').send({ revision, brand: { ...brand, address: 'Updated platform address' }, values: updatedValues });
    expect(saved.status).toBe(200);
    const published = await request(app).get('/api/platform/public/website').set('Host', 'platform.test');
    for (const key of ['about.h2.11', 'contact.h2.10', 'privacy.text.2', 'footer.p.3', 'navigation.label.4', 'auth.text.3']) expect(published.body.values[key]).toBe(updatedValues[key]);
    expect(published.body.values['terms.time.14']).toBe('01 Jan 2027');
    expect(published.body.values['privacy.time.12']).toBe('02 Feb 2027');
    expect((await models.WebsiteContent.findById('platform').lean())?.values['terms.time.14']).toBe('01 Jan 2027');
    expect((await request(app).get('/api/platform/public/website').set('Host', 'platform.test')).body.brand.address).toBe('Updated platform address');
    expect((await request(app).get('/api/public/website').set('Host', 'a.test')).body.brand.address).not.toBe('Updated platform address');
  });
  it('validates owner uploads and reports storage configuration without touching AWS', async () => {
    const body = { field: 'logo', contentType: 'image/png', size: 1024 };
    const result = await api(developer, 'post', '/api/platform/website/images/upload').send(body);
    expect(result.status).toBe(503); expect(result.body.error.code).toBe('IMAGE_STORAGE_NOT_CONFIGURED');
    expect((await api(ownerA, 'post', '/api/tenant/website/images/upload').send({ ...body, size: 5242881 })).status).toBe(400);
    expect((await api({ ...ownerA, host: 'b.test' }, 'post', '/api/tenant/website/images/upload').send(body)).status).toBe(403);
  });
});

describe('Role hierarchy and isolation', () => {
  it('allows Super Admin to create Distributor and direct Retailer', async () => { distributor = await create(ownerA, 'distributors', 'DistributorOne'); distributor2 = await create(ownerA, 'distributors', 'DistributorTwo'); directRetailer = await create(ownerA, 'retailers', 'DirectRetailer'); });
  it('allows Distributor to create Retailer with a wallet and correct parent', async () => { retailer = await create(distributor, 'retailers', 'RetailerOne'); const user = await models.User.findById(retailer.id); expect(String(user?.parentId)).toBe(distributor.id); expect(String(user?.createdBy)).toBe(distributor.id); expect(await balance(retailer)).toBe(0); });
  it('rejects Distributor creation by Distributor and user creation by Retailer', async () => {
    expect((await api(distributor, 'post', '/api/users/distributors').send(person('IllegalDistributor'))).status).toBe(403);
    expect((await api(retailer, 'post', '/api/users/retailers').send(person('IllegalRetailer'))).status).toBe(403);
  });
  it('rejects cross-tenant IDs, tokens and body injection', async () => {
    expect((await api(ownerB, 'get', `/api/users/${retailer.id}`)).status).toBe(404);
    expect((await api({ ...ownerA, host: 'b.test' }, 'get', '/api/users')).status).toBe(403);
    expect((await api(ownerA, 'post', '/api/users/retailers').send({ ...person('Injected'), tenantId: tenantB })).status).toBe(400);
    expect((await api(ownerA, 'patch', `/api/users/${retailer.id}`).send({ role: 'SUPER_ADMIN', balanceMinor: 999999 })).status).toBe(400);
    expect((await api(ownerA, 'get', '/api/platform/tenants')).status).toBe(404);
    expect((await api({ ...ownerA, host: 'platform.test' }, 'get', '/api/platform/tenants')).status).toBe(403);
  });
  it('rejects unrelated downline management, reports and transfers', async () => {
    expect((await api(distributor2, 'get', '/api/tenant/website')).status).toBe(403);
    expect((await api(retailer, 'patch', '/api/tenant/website').send({})).status).toBe(403);
    expect((await api(distributor2, 'post', '/api/tenant/website/images/upload').send({})).status).toBe(403);
    expect((await api(retailer, 'post', '/api/tenant/website/images/upload').send({})).status).toBe(403);
    expect((await request(app).post('/api/platform/website/images/upload').set('Host', 'platform.test').send({})).status).toBe(401);
    expect((await api(distributor2, 'get', `/api/users/${retailer.id}`)).status).toBe(403);
    expect((await api(distributor2, 'patch', `/api/users/${retailer.id}/status`).send({ status: 'BLOCKED' })).status).toBe(403);
    expect((await api(distributor2, 'post', '/api/wallet/transfers').set('Idempotency-Key', 'invalid-transfer').send({ toUserId: retailer.id, amountMinor: 1000 })).status).toBe(403);
    const users = await api(distributor2, 'get', '/api/users'); expect(users.body.total).toBe(0);
  });
  it('blocks suspended tenants and inactive subscriptions', async () => {
    expect((await api(developer, 'patch', `/api/platform/tenants/${tenantB}/status`).send({ status: 'SUSPENDED' })).status).toBe(200);
    expect((await api(ownerB, 'get', '/api/wallet')).status).toBe(403);
    await api(developer, 'patch', `/api/platform/tenants/${tenantB}/status`).send({ status: 'ACTIVE' });
    const tenant = await models.Tenant.findById(tenantB); await models.Subscription.updateOne({ _id: tenant!.subscriptionId }, { $set: { endAt: new Date(Date.now() - 1000) } });
    await expireSubscriptions(); expect((await api(ownerB, 'get', '/api/wallet')).status).toBe(403);
    const renewed = await api(developer, 'post', '/api/platform/subscriptions').send({ tenantId: tenantB, planId, startAt: new Date(), endAt: new Date(Date.now() + 86400000) }); expect(renewed.status).toBe(201);
    expect((await api(ownerB, 'get', '/api/wallet')).status).toBe(200);
  });
});
describe('Atomic wallets and append-only ledger', () => {
  it('funds through explicit approval, forbids self approval, and never credits twice', async () => {
    const fundingId = await funding(ownerA, 500000);
    const repeated = await api(developer, 'post', `/api/platform/tenants/${tenantA}/funding-requests/${fundingId}/decision`).send({ approve: true }); expect(repeated.status).toBe(200); expect(await balance(ownerA)).toBe(500000);
    const pending = await api(ownerA, 'post', '/api/wallet/funding-requests').send({ amountMinor: 1000, reference: 'self-approval-test' });
    expect((await api(ownerA, 'post', `/api/wallet/funding-requests/${pending.body._id}/decision`).send({ approve: true })).status).toBe(403);
  });
  it('deduplicates concurrent transfers and rejects key reuse with another payload', async () => {
    const responses = await Promise.all([1, 2].map(() => api(ownerA, 'post', '/api/wallet/transfers').set('Idempotency-Key', 'duplicate-transfer').send({ toUserId: distributor.id, amountMinor: 100000 })));
    expect(responses.map(r => r.status)).toEqual([201, 201]); expect(responses[0]!.body._id).toBe(responses[1]!.body._id); expect(await balance(distributor)).toBe(100000);
    expect((await api(ownerA, 'post', '/api/wallet/transfers').set('Idempotency-Key', 'duplicate-transfer').send({ toUserId: distributor.id, amountMinor: 100001 })).status).toBe(409);
  });
  it('prevents concurrent overdrafts', async () => {
    await funding(distributor2, 10000);
    const child = await create(distributor2, 'retailers', 'ConcurrencyRetailer');
    const responses = await Promise.all([1, 2].map(i => api(distributor2, 'post', '/api/wallet/transfers').set('Idempotency-Key', `concurrent-debit-${i}`).send({ toUserId: child.id, amountMinor: 8000 })));
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]); expect(await balance(distributor2)).toBe(2000); expect(await balance(child)).toBe(8000);
  });
  it('rejects insufficient balances and fractional money', async () => {
    expect((await api(distributor2, 'post', '/api/wallet/transfers').set('Idempotency-Key', 'insufficient-funds').send({ toUserId: (await models.User.findOne({ parentId: distributor2.id }))!._id, amountMinor: 9000 })).status).toBe(409);
    expect((await api(ownerA, 'post', '/api/wallet/transfers').set('Idempotency-Key', 'fractional-money').send({ toUserId: distributor.id, amountMinor: 0.5 })).status).toBe(400);
    await expect(models.Ledger.updateMany({}, { $set: { amountMinor: 1 } })).rejects.toThrow('append only');
  });
  it('reverses a transfer through compensating entries exactly once', async () => {
    const before = await balance(distributor);
    const transfer = await api(ownerA, 'post', '/api/wallet/transfers').set('Idempotency-Key', 'reversal-transfer').send({ toUserId: distributor.id, amountMinor: 1000 });
    expect((await api(ownerA, 'post', `/api/wallet/transfers/${transfer.body._id}/reverse`)).status).toBe(200);
    expect((await api(ownerA, 'post', `/api/wallet/transfers/${transfer.body._id}/reverse`)).status).toBe(200); expect(await balance(distributor)).toBe(before);
  });
});
describe('Recharge state machine, commissions and callbacks', () => {
  it('configures direct payout rules within a 5 percent budget', async () => {
    await funding(retailer, 200000); await funding(directRetailer, 100000);
    for (const [beneficiaryRole, commissionValue] of [['RETAILER', 100], ['DISTRIBUTOR', 100], ['SUPER_ADMIN', 100]] as const) {
      const response = await api(ownerA, 'post', '/api/commissions/rules').send({ operatorId, serviceType: 'MOBILE', beneficiaryRole, calculationType: 'PERCENTAGE', commissionValue, effectiveFrom: new Date(Date.now() - 1000) }); expect(response.status, JSON.stringify(response.body)).toBe(201);
    }
    expect((await api(ownerA, 'post', '/api/commissions/rules').send({ operatorId, serviceType: 'MOBILE', beneficiaryRole: 'RETAILER', calculationType: 'PERCENTAGE', commissionValue: 1000, effectiveFrom: new Date() })).status).toBe(400);
  });
  it('settles success and credits the actual three-level hierarchy only once', async () => {
    const before = await balance(retailer); const result = await recharge(); expect(result.status, JSON.stringify(result.body)).toBe(202);
    await processRecharge(result.body._id as string); await processRecharge(result.body._id as string);
    const transaction = await models.Transaction.findById(result.body._id); expect(transaction!.status).toBe('SUCCESS'); expect(await balance(retailer)).toBe(before - 10000 + 100);
    expect(await models.Commission.countDocuments({ transactionId: transaction!._id })).toBe(3);
    const records = await models.Commission.find({ transactionId: transaction!._id }); expect(records.every(r => r.amountMinor === 100)).toBe(true);
  });
  it('supports direct Retailers without inventing a Distributor beneficiary', async () => {
    const result = await recharge('9876543210', 10000, directRetailer); expect(result.status).toBe(202); await processRecharge(result.body._id as string);
    expect(await models.Commission.countDocuments({ transactionId: result.body._id })).toBe(2);
  });
  it('refunds a definitive failure idempotently and releases commission reserve', async () => {
    const before = await balance(retailer), ownerBefore = await balance(ownerA);
    const result = await recharge('9876500000'); expect(result.status).toBe(202); await processRecharge(result.body._id as string); await processRecharge(result.body._id as string);
    expect((await models.Transaction.findById(result.body._id))!.status).toBe('REFUNDED'); expect(await balance(retailer)).toBe(before); expect(await balance(ownerA)).toBe(ownerBefore);
    expect(await models.Ledger.countDocuments({ transactionId: result.body._id, entryType: 'REFUND', userId: retailer.id })).toBe(1);
  });
  it('keeps ambiguous timeouts reserved and deduplicates signed callbacks', async () => {
    const before = await balance(retailer); const result = await recharge('9876599999'); expect(result.status).toBe(202);
    await expect(processRecharge(result.body._id as string)).rejects.toThrow('RECONCILIATION'); expect((await models.Transaction.findById(result.body._id))!.status).toBe('PROCESSING'); expect(await balance(retailer)).toBe(before - 10000);
    const body = JSON.stringify({ eventId: 'timeout-success-event', transactionId: result.body._id, result: { status: 'SUCCESS', providerTransactionId: `mock-${result.body._id}` } });
    const timestamp = String(Math.floor(Date.now() / 1000)); const signature = createHmac('sha256', process.env.WEBHOOK_SECRET!).update(`${timestamp}.${body}`).digest('hex');
    for (let i = 0; i < 2; i++) expect((await request(app).post('/api/webhooks/mock').set('Content-Type', 'application/json').set('X-Webhook-Timestamp', timestamp).set('X-Webhook-Signature', signature).send(body)).status).toBe(200);
    expect(await models.WebhookEvent.countDocuments({ transactionId: result.body._id })).toBe(1); expect(await models.Commission.countDocuments({ transactionId: result.body._id })).toBe(3);
    expect((await request(app).post('/api/webhooks/mock').set('Content-Type', 'application/json').set('X-Webhook-Timestamp', timestamp).set('X-Webhook-Signature', '0'.repeat(64)).send(body)).status).toBe(401);
  });
  it('reverses paid commissions and refunds only once', async () => {
    const before = await balance(retailer), ownerBefore = await balance(ownerA), distBefore = await balance(distributor);
    const result = await recharge(); await processRecharge(result.body._id as string);
    for (let i = 0; i < 2; i++) expect((await api(ownerA, 'post', `/api/recharges/${result.body._id}/reverse`).send({ reason: 'Confirmed provider reversal reference ABC123', providerReversalConfirmed: true })).status).toBe(200);
    expect(await balance(retailer)).toBe(before); expect(await balance(ownerA)).toBe(ownerBefore); expect(await balance(distributor)).toBe(distBefore);
    expect(await models.Commission.countDocuments({ transactionId: result.body._id, status: 'REVERSED' })).toBe(3);
  });
  it('rejects insufficient recharge balances and deduplicates recharge requests', async () => {
    expect((await recharge('9876543210', 1000000)).status).toBe(409);
    const first = await recharge('9876543210', 10000, retailer, 'duplicate-recharge'); const second = await recharge('9876543210', 10000, retailer, 'duplicate-recharge'); expect(first.body._id).toBe(second.body._id);
    expect((await recharge('9876543210', 11000, retailer, 'duplicate-recharge')).status).toBe(409);
    await processRecharge(first.body._id as string);
  });
  it('fetches and pays a mock BBPS bill and enforces bill amount', async () => {
    const bill = await api(retailer, 'post', '/api/bill-payments/inquiries').send({ operatorId: billOperatorId, account: 'BILL12345' }); expect(bill.status).toBe(201);
    const invalid = await api(retailer, 'post', '/api/bill-payments').set('Idempotency-Key', 'invalid-bill-amount').send({ operatorId: billOperatorId, account: 'BILL12345', amountMinor: 11000, serviceType: 'BBPS', billId: bill.body._id }); expect(invalid.status).toBe(400);
    const paid = await api(retailer, 'post', '/api/bill-payments').set('Idempotency-Key', 'bill-payment-key').send({ operatorId: billOperatorId, account: 'BILL12345', amountMinor: bill.body.amountMinor, serviceType: 'BBPS', billId: bill.body._id }); expect(paid.status).toBe(202); await processRecharge(paid.body._id as string); expect((await models.Transaction.findById(paid.body._id))!.status).toBe('SUCCESS');
  });
  it('enforces report and transaction visibility', async () => {
    const result = await recharge(); await processRecharge(result.body._id as string);
    expect((await api(distributor2, 'get', `/api/recharges/${result.body._id}`)).status).toBe(404); expect((await api(ownerB, 'get', `/api/recharges/${result.body._id}`)).status).toBe(404);
    const dashboard = await api(distributor2, 'get', '/api/reports/dashboard'); expect(dashboard.status).toBe(200); expect(dashboard.body.transactions).toEqual([]);
  });
  it('deduplicates concurrent provider processing with a lease', async () => {
    const result = await recharge(); expect(result.status).toBe(202);
    await Promise.all([processRecharge(result.body._id as string), processRecharge(result.body._id as string)]);
    expect((await models.Transaction.findById(result.body._id))!.status).toBe('SUCCESS');
    expect(await models.Commission.countDocuments({ transactionId: result.body._id })).toBe(3);
  });
  it('settles committed orders even after tenant suspension', async () => {
    const result = await recharge(); expect(result.status).toBe(202);
    await api(developer, 'patch', `/api/platform/tenants/${tenantA}/status`).send({ status: 'SUSPENDED' });
    try { await processRecharge(result.body._id as string); expect((await models.Transaction.findById(result.body._id))!.status).toBe('SUCCESS'); }
    finally { await api(developer, 'patch', `/api/platform/tenants/${tenantA}/status`).send({ status: 'ACTIVE' }); }
  });
  it('uses fixed paise and floors basis point commissions', async () => {
    const provider = await models.Provider.findOne({ code: 'MOCK' });
    const operator = await models.Operator.create({ name: 'DTH mock', code: 'MOCK_DTH', serviceType: 'DTH', providerId: provider!._id, minMinor: 1000, maxMinor: 1000000, commissionBudgetBps: 500 });
    for (const [beneficiaryRole, calculationType, commissionValue] of [['RETAILER', 'FIXED', 10], ['SUPER_ADMIN', 'PERCENTAGE', 25]] as const) expect((await api(ownerA, 'post', '/api/commissions/rules').send({ operatorId: String(operator._id), serviceType: 'DTH', beneficiaryRole, calculationType, commissionValue, effectiveFrom: new Date(Date.now() - 1000) })).status).toBe(201);
    const result = await api(retailer, 'post', '/api/recharges').set('Idempotency-Key', 'fixed-rounding-recharge').send({ serviceType: 'DTH', operatorId: String(operator._id), account: 'DTH12345', amountMinor: 3333 }); expect(result.status).toBe(202); await processRecharge(result.body._id as string);
    expect((await models.Commission.find({ transactionId: result.body._id })).map(r => r.amountMinor).sort((a, b) => a - b)).toEqual([8, 10]);
  });
  it('does not pay the same consumed bill inquiry again with a different key', async () => {
    const bill = await models.Bill.findOne({ userId: retailer.id, consumedAt: { $exists: true } });
    expect((await api(retailer, 'post', '/api/bill-payments').set('Idempotency-Key', 'bill-reuse-other-key').send({ operatorId: billOperatorId, account: 'BILL12345', amountMinor: bill!.amountMinor, serviceType: 'BBPS', billId: String(bill!._id) })).status).toBe(400);
  });
  it('applies global service restrictions without stopping existing payments', async () => {
    const pending = await recharge();
    expect((await api(developer, 'patch', '/api/platform/settings').send({ enabledServices: ['DTH'], maxRechargeMinor: 1000000 })).status).toBe(200);
    try { expect((await recharge()).status).toBe(403); await processRecharge(pending.body._id as string); expect((await models.Transaction.findById(pending.body._id))!.status).toBe('SUCCESS'); }
    finally { await api(developer, 'patch', '/api/platform/settings').send({ enabledServices: ['MOBILE', 'DTH', 'POSTPAID', 'ELECTRICITY', 'BBPS'], maxRechargeMinor: 1000000000 }); }
  });
});
describe('Sessions, input validation and auxiliary APIs', () => {
  it('rotates refresh tokens, checks CSRF and revokes reused token families', async () => {
    const identity = await login('a.test', person('RetailerOne').email);
    expect((await request(app).post('/api/auth/refresh').set('Host', 'a.test').set('Cookie', identity.cookie)).status).toBe(403);
    const refreshed = await request(app).post('/api/auth/refresh').set('Host', 'a.test').set('Cookie', identity.cookie).set('X-CSRF-Token', identity.csrf); expect(refreshed.status).toBe(200); expect(refreshed.body.accessToken).not.toBe(identity.token);
    expect((await request(app).post('/api/auth/refresh').set('Host', 'a.test').set('Cookie', identity.cookie).set('X-CSRF-Token', identity.csrf)).status).toBe(401);
    expect((await api({ ...identity, token: refreshed.body.accessToken as string }, 'get', '/api/wallet')).status).toBe(401);
  });
  it('does not allow NoSQL operators in credentials', async () => { expect((await request(app).post('/api/auth/login').set('Host', 'a.test').send({ email: { $ne: null }, password: secretPassword })).status).toBe(400); });
  it('creates support tickets and isolates them across tenants', async () => {
    const ticket = await api(retailer, 'post', '/api/support-tickets').send({ subject: 'Recharge enquiry', message: 'Please investigate this recharge status.' }); expect(ticket.status).toBe(201);
    expect((await api(ownerB, 'patch', `/api/support-tickets/${ticket.body._id}`).send({ status: 'CLOSED', response: 'closed' })).status).toBe(404);
    expect((await api(ownerA, 'patch', `/api/support-tickets/${ticket.body._id}`).send({ status: 'CLOSED', response: 'Resolved' })).status).toBe(200);
    expect((await api(retailer, 'get', '/api/notifications')).status).toBe(200);
  });
  it('provides health, readiness and OpenAPI endpoints', async () => { expect((await request(app).get('/health')).status).toBe(200); expect((await request(app).get('/ready')).status).toBe(200); expect((await request(app).get('/api/openapi.json')).body.openapi).toBe('3.0.3'); });
  it('atomically rotates concurrent refreshes and revokes the losing family', async () => {
    const identity = await login('a.test', person('RetailerOne').email);
    const results = await Promise.all([1, 2].map(() => request(app).post('/api/auth/refresh').set('Host', 'a.test').set('Cookie', identity.cookie).set('X-CSRF-Token', identity.csrf)));
    expect(results.map(r => r.status).sort()).toEqual([200, 401]);
    const winner = results.find(r => r.status === 200)!;
    expect((await api({ ...identity, token: winner.body.accessToken as string }, 'get', '/api/wallet')).status).toBe(401);
  });
  it('delivers a single-use reset token, rejects another tenant and revokes sessions', async () => {
    let delivered: { token: string } | undefined;
    const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => { delivered = JSON.parse(String(init?.body)) as { token: string }; return new Response(null, { status: 200 }); });
    try {
      expect((await request(app).post('/api/auth/password-reset/request').set('Host', 'a.test').send({ email: person('DirectRetailer').email })).status).toBe(202);
      const token = delivered!.token;
      expect((await request(app).post('/api/auth/password-reset/confirm').set('Host', 'b.test').send({ token, password: 'Replacement-test-password!' })).status).toBe(400);
      expect((await request(app).post('/api/auth/password-reset/confirm').set('Host', 'a.test').send({ token, password: 'Replacement-test-password!' })).status).toBe(204);
      expect((await api(directRetailer, 'get', '/api/wallet')).status).toBe(401);
      expect((await request(app).post('/api/auth/password-reset/confirm').set('Host', 'a.test').send({ token, password: 'Replacement-test-password!' })).status).toBe(400);
    } finally { mock.mockRestore(); }
  });
  it('validates the entire generated OpenAPI contract', async () => {
    const { default: SwaggerParser } = await import('@apidevtools/swagger-parser');
    const { openapi } = await import('../src/openapi.js');
    // Serialize to avoid parser dereferencing the shared runtime schema registry in place.
    const schema = JSON.parse(JSON.stringify(openapi)) as Parameters<typeof SwaggerParser.validate>[0];
    await expect(SwaggerParser.validate(schema)).resolves.toBeDefined();
  });
  it('rejects malformed origins and oversized JSON with safe errors', async () => {
    const invalidOrigin = await request(app).get('/api/public/tenant-config').set('Host', 'api.test').set('Origin', 'invalid-url'); expect(invalidOrigin.status).toBe(403);
    const tooLarge = await request(app).post('/api/auth/login').set('Host', 'a.test').send({ email: 'x'.repeat(40000), password: secretPassword }); expect(tooLarge.status).toBe(413); expect(tooLarge.body.error.code).toBe('REQUEST_TOO_LARGE');
  });
});
