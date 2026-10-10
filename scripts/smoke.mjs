import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { setTimeout as pause } from 'node:timers/promises';
import mongoose from 'mongoose';
import 'dotenv/config';

// Dedicated database and queue namespace. No development records are read or modified.
const suffix = randomBytes(8).toString('hex');
const dbName = `recharge_smoke_${suffix}`;
const mongoUrl = new URL(process.env.SMOKE_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true');
mongoUrl.pathname = `/${dbName}`;
Object.assign(process.env, {
  NODE_ENV: 'test', MONGODB_URI: mongoUrl.toString(), MOCK_PROVIDER_ENABLED: 'true',
  JWT_SECRET: randomBytes(48).toString('hex'), WEBHOOK_SECRET: randomBytes(48).toString('hex'),
  QUEUE_PREFIX: `smoke_${suffix}`, PLATFORM_HOSTS: 'platform.smoke.test', SHARED_API_HOSTS: 'api.smoke.test',
  PLATFORM_ORIGINS: 'http://platform.smoke.test', COOKIE_SECURE: 'false', LOG_LEVEL: 'silent'
});
const { connectDatabase, initializeIndexes } = await import('../dist/database/index.js');
const { createApp } = await import('../dist/app.js');
const { createRechargeQueue } = await import('../dist/queues/index.js');
const { User, Provider, Operator, TenantDomain } = await import('../dist/models/index.js');
const { passwordHash } = await import('../dist/modules/auth/service.js');
await connectDatabase();
await initializeIndexes();
const queue = createRechargeQueue();
queue.on('error', () => {});
await queue.waitUntilReady();
const server = createApp(async () => { await queue.getJobCounts(); }).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const port = server.address().port;
const worker = spawn(process.execPath, ['dist/workers/main.js'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let workerError = '';
worker.stderr.on('data', chunk => { workerError += chunk.toString(); });
const password = randomBytes(24).toString('hex');
const person = name => ({ name, email: `${name.toLowerCase()}@smoke.test`, phone: '+919876543210', password });
async function api(path, { method = 'GET', host = 'platform.smoke.test', token, body, key } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method, headers: { Host: host, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, timeout: 10000 }, res => {
      let raw = ''; res.setEncoding('utf8'); res.on('data', chunk => { raw += chunk; });
      res.on('end', () => { try { const data = raw ? JSON.parse(raw) : null; assert(res.statusCode >= 200 && res.statusCode < 300, `${method} ${path} failed ${res.statusCode}: ${raw}`); resolve(data); } catch (error) { reject(error); } });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('HTTP smoke timeout')));
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
try {
  await api('/ready');
  const initial = person('Developer');
  await User.create({ name: initial.name, email: initial.email, phone: initial.phone, passwordHash: await passwordHash(password), role: 'DEVELOPER' });
  const developer = await api('/api/platform/auth/login', { method: 'POST', body: { email: initial.email, password } });
  const admin = { token: developer.accessToken };
  const plan = await api('/api/platform/plans', { ...admin, method: 'POST', body: { name: 'Smoke', priceMinor: 0, durationDays: 1, features: ['mobile'] } });
  const tenant = await api('/api/platform/tenants', { ...admin, method: 'POST', body: { name: 'Smoke Tenant', slug: `smoke-${suffix}`, planId: plan._id, owner: person('Owner') } });
  // Test fixture only: live runtime verification remains DNS-only.
  await TenantDomain.create({ tenantId: tenant._id, hostname: 'tenant.smoke.test', verificationToken: suffix, verifiedAt: new Date(), primary: true });
  const owner = await api('/api/auth/login', { method: 'POST', host: 'tenant.smoke.test', body: { email: person('Owner').email, password } });
  const ownerAuth = { host: 'tenant.smoke.test', token: owner.accessToken };
  await api('/api/users/retailers', { ...ownerAuth, method: 'POST', body: person('Retailer') });
  const retailer = await api('/api/auth/login', { method: 'POST', host: 'tenant.smoke.test', body: { email: person('Retailer').email, password } });
  const retailerAuth = { host: 'tenant.smoke.test', token: retailer.accessToken };
  const funding = await api('/api/wallet/funding-requests', { ...retailerAuth, method: 'POST', body: { amountMinor: 20000, reference: `smoke-bank-${suffix}` } });
  await api(`/api/platform/tenants/${tenant._id}/funding-requests/${funding._id}/decision`, { ...admin, method: 'POST', body: { approve: true } });
  const provider = await Provider.create({ code: 'MOCK', name: 'Smoke Mock', enabled: true });
  const operator = await Operator.create({ code: 'MOCK_MOBILE', name: 'Smoke Mobile', providerId: provider._id, serviceType: 'MOBILE', minMinor: 1000, maxMinor: 1000000, commissionBudgetBps: 500 });
  const transaction = await api('/api/recharges', { ...retailerAuth, method: 'POST', key: `smoke-key-${suffix}`, body: { operatorId: String(operator._id), serviceType: 'MOBILE', account: '9876543210', amountMinor: 10000 } });
  let final;
  for (let tries = 0; tries < 60; tries++) {
    if (worker.exitCode !== null) throw new Error(`Worker exited: ${workerError}`);
    final = await api(`/api/recharges/${transaction._id}`, retailerAuth);
    if (final.status === 'SUCCESS') break;
    await pause(1000);
  }
  assert.equal(final.status, 'SUCCESS', `Worker failed to settle: ${workerError}`);
  const wallet = await api('/api/wallet', retailerAuth); assert.equal(wallet.balanceMinor, 10000);
  const ledger = await api('/api/wallet/ledger', retailerAuth); assert.equal(ledger.total, 2);
  console.log('PASS: real HTTP login/provisioning/funding, MongoDB transaction, outbox -> Redis/BullMQ -> separate worker -> SUCCESS, exact wallet/ledger.');
} finally {
  worker.kill('SIGTERM');
  await Promise.race([new Promise(resolve => worker.once('exit', resolve)), pause(10000)]);
  if (worker.exitCode === null) worker.kill('SIGKILL');
  await new Promise(resolve => server.close(resolve));
  await queue.obliterate({ force: true }); // Only this randomly generated smoke prefix.
  await queue.close();
  assert(mongoose.connection.name === dbName && dbName.startsWith('recharge_smoke_'));
  await mongoose.connection.dropDatabase(); // Only this newly created smoke database.
  await mongoose.disconnect();
}
