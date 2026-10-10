import { Router } from 'express';
import { z } from 'zod';
import { permit, wrap } from '../../middleware/security.js';
import { input } from '../../validators/index.js';
import { Tenant, TenantDomain, TenantSettings, Audit } from '../../models/index.js';
import { addDomain, verifyDomain, primaryDomain } from '../domains/service.js';
import { ensure, oid } from '../../utils/core.js';
import { services } from '../../constants/index.js';
export const tenantRoutes = Router();
tenantRoutes.use(permit('SUPER_ADMIN'));
tenantRoutes.get('/', wrap(async (req, res) => { res.json(req.tenant); }));
tenantRoutes.patch('/branding', wrap(async (req, res) => {
  const b = input(req, z.object({ logo: z.url().startsWith('https://').optional(), primaryColor: z.string().regex(/^#[a-f\d]{6}$/i), secondaryColor: z.string().regex(/^#[a-f\d]{6}$/i) }).strict());
  const tenant = await Tenant.findByIdAndUpdate(req.tenant!._id, { $set: { branding: b } }, { returnDocument: 'after' }); await Audit.create({ tenantId: req.tenant!._id, actorId: req.user!._id, action: 'BRANDING_UPDATE' }); res.json(tenant?.branding);
}));
tenantRoutes.get('/settings', wrap(async (req, res) => { res.json(await TenantSettings.findOne({ tenantId: req.tenant!._id })); }));
tenantRoutes.patch('/settings', wrap(async (req, res) => {
  const b = input(req, z.object({ enabledServices: z.array(z.enum(services)).max(5), supportEmail: z.email().optional(), supportPhone: z.string().max(20).optional() }).strict());
  res.json(await TenantSettings.findOneAndUpdate({ tenantId: req.tenant!._id }, { $set: b }, { returnDocument: 'after', runValidators: true })); await Audit.create({ tenantId: req.tenant!._id, actorId: req.user!._id, action: 'SETTINGS_UPDATE' });
}));
tenantRoutes.get('/domains', wrap(async (req, res) => { res.json(await TenantDomain.find({ tenantId: req.tenant!._id })); }));
tenantRoutes.post('/domains', wrap(async (req, res) => { const b = input(req, z.object({ hostname: z.string().max(253) }).strict()); res.status(201).json(await addDomain(String(req.tenant!._id), b.hostname, String(req.user!._id))); }));
tenantRoutes.post('/domains/:id/verify', wrap(async (req, res) => { res.json(await verifyDomain(String(req.tenant!._id), String(req.params.id))); }));
tenantRoutes.patch('/domains/:id/primary', wrap(async (req, res) => { res.json(await primaryDomain(String(req.tenant!._id), String(req.params.id))); }));
tenantRoutes.delete('/domains/:id', wrap(async (req, res) => { const deleted = await TenantDomain.findOneAndDelete({ _id: oid(String(req.params.id)), tenantId: req.tenant!._id, primary: false }); ensure(deleted, 409, 'DOMAIN_NOT_FOUND_OR_PRIMARY'); await Audit.create({ tenantId: req.tenant!._id, actorId: req.user!._id, action: 'DOMAIN_DELETE', targetId: String(deleted._id) }); res.status(204).end(); }));
