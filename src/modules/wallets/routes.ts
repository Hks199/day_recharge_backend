import { Router } from 'express';
import { z } from 'zod';
import { permit, wrap } from '../../middleware/security.js';
import { input, id, amount, key, page } from '../../validators/index.js';
import { Wallet, Ledger, Transfer, FundingRequest, Audit } from '../../models/index.js';
import { oid, ensure } from '../../utils/core.js';
import { accessible } from '../users/service.js';
import * as wallet from './service.js';
export const walletRoutes = Router();
walletRoutes.get('/', wrap(async (req, res) => { res.json(await Wallet.findOne({ tenantId: req.user!.tenantId, userId: req.user!._id })); }));
walletRoutes.get('/ledger', wrap(async (req, res) => {
  const p = page(req); const userId = typeof req.query.userId === 'string' ? req.query.userId : String(req.user!._id); await accessible(req, userId);
  const filter = { tenantId: req.user!.tenantId, userId: oid(userId) };
  res.json({ data: await Ledger.find(filter).sort({ createdAt: -1, _id: -1 }).skip((p.page - 1) * p.limit).limit(p.limit), total: await Ledger.countDocuments(filter), ...p });
}));
walletRoutes.post('/transfers', permit('SUPER_ADMIN', 'DISTRIBUTOR'), wrap(async (req, res) => { const b = input(req, z.object({ toUserId: id, amountMinor: amount }).strict()); res.status(201).json(await wallet.transferFunds(req, b.toUserId, b.amountMinor, key(req))); }));
walletRoutes.get('/transfers', wrap(async (req, res) => {
  const p = page(req); const filter = { tenantId: req.user!.tenantId, ...(req.user!.role === 'SUPER_ADMIN' ? {} : { $or: [{ fromUserId: req.user!._id }, { toUserId: req.user!._id }] }) };
  res.json({ data: await Transfer.find(filter).sort({ createdAt: -1 }).skip((p.page - 1) * p.limit).limit(p.limit), total: await Transfer.countDocuments(filter), ...p });
}));
walletRoutes.post('/transfers/:id/reverse', permit('SUPER_ADMIN'), wrap(async (req, res) => { res.json(await wallet.reverseTransfer(req, String(req.params.id))); }));
walletRoutes.post('/funding-requests', wrap(async (req, res) => { const b = input(req, z.object({ amountMinor: amount, reference: z.string().min(8).max(100) }).strict()); res.status(201).json(await FundingRequest.create({ tenantId: req.user!.tenantId, userId: req.user!._id, ...b })); }));
walletRoutes.get('/funding-requests', wrap(async (req, res) => { const p = page(req); res.json(await FundingRequest.find({ tenantId: req.user!.tenantId, ...(req.user!.role === 'SUPER_ADMIN' ? {} : { userId: req.user!._id }) }).sort({ createdAt: -1 }).skip((p.page - 1) * p.limit).limit(p.limit)); }));
walletRoutes.post('/funding-requests/:id/decision', permit('SUPER_ADMIN'), wrap(async (req, res) => { const b = input(req, z.object({ approve: z.boolean() }).strict()); res.json(await wallet.approveFunding(req, String(req.user!.tenantId), String(req.params.id), b.approve)); }));
walletRoutes.patch('/:userId/status', permit('SUPER_ADMIN'), wrap(async (req, res) => {
  await accessible(req, String(req.params.userId)); const b = input(req, z.object({ status: z.enum(['ACTIVE', 'BLOCKED']) }).strict());
  const result = await Wallet.findOneAndUpdate({ tenantId: req.user!.tenantId, userId: oid(String(req.params.userId)) }, { $set: b }, { returnDocument: 'after' }); ensure(result, 404, 'WALLET_NOT_FOUND');
  await Audit.create({ tenantId: req.user!.tenantId, actorId: req.user!._id, action: 'WALLET_STATUS', targetId: String(result._id) }); res.json(result);
}));
