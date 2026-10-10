import { domainToASCII } from 'node:url';
import { resolveTxt } from 'node:dns/promises';
import { TenantDomain, Tenant, Audit } from '../../models/index.js';
import { ensure, opaqueToken, oid, atomic } from '../../utils/core.js';

export function normalizeDomain(value: string) {
  const domain = domainToASCII(value.trim().toLowerCase().replace(/\.$/, ''));
  ensure(domain.length <= 253 && domain.includes('.') && !/^\d+(\.\d+){3}$/.test(domain) && domain.split('.').every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label)), 400, 'INVALID_DOMAIN');
  return domain;
}
export async function addDomain(tenantId: string, hostname: string, actorId: string) {
  const verificationToken = opaqueToken();
  const domain = await TenantDomain.create({ tenantId, hostname: normalizeDomain(hostname), verificationToken });
  await Audit.create({ tenantId, actorId, action: 'DOMAIN_ADD', targetId: String(domain._id) });
  return { id: domain._id, hostname: domain.hostname, txtName: `_recharge-verification.${domain.hostname}`, txtValue: verificationToken };
}
export async function verifyDomain(tenantId: string, domainId: string, lookup = resolveTxt) {
  const domain = await TenantDomain.findOne({ _id: oid(domainId), tenantId }).select('+verificationToken');
  ensure(domain, 404, 'DOMAIN_NOT_FOUND');
  let records: string[][] = [];
  try { records = await lookup(`_recharge-verification.${domain.hostname}`); } catch { /* Fail closed on DNS failures. */ }
  ensure(records.some(record => record.join('') === domain.verificationToken), 400, 'DOMAIN_OWNERSHIP_UNVERIFIED');
  domain.verifiedAt = new Date(); await domain.save();
  return { id: domain._id, hostname: domain.hostname, verifiedAt: domain.verifiedAt };
}
export async function primaryDomain(tenantId: string, domainId: string) {
  return atomic(async session => {
    // Serialize concurrent domain changes against the tenant document.
    await Tenant.updateOne({ _id: tenantId }, { $set: { updatedAt: new Date() } }, { session });
    const domain = await TenantDomain.findOne({ _id: oid(domainId), tenantId, verifiedAt: { $exists: true } }).session(session);
    ensure(domain, 400, 'VERIFIED_DOMAIN_REQUIRED');
    await TenantDomain.updateMany({ tenantId, primary: true }, { $set: { primary: false } }, { session });
    domain.primary = true; await domain.save({ session }); return domain;
  });
}
