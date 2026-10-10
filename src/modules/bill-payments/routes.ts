import { Router } from 'express';
import { z } from 'zod';
import { input, id } from '../../validators/index.js';
import { permit, wrap } from '../../middleware/security.js';
import { Operator, Provider, Bill } from '../../models/index.js';
import { ensure, hash, oid } from '../../utils/core.js';
import { adapter } from '../../providers/index.js';
import { rechargeRoutes } from '../recharges/routes.js';
export const billRoutes = Router();
billRoutes.post('/inquiries', permit('RETAILER'), wrap(async (req, res) => {
  const b = input(req, z.object({ operatorId: id, account: z.string().regex(/^[A-Za-z0-9@._-]{5,64}$/) }).strict());
  const operator = await Operator.findOne({ _id: oid(b.operatorId), enabled: true, serviceType: { $in: ['POSTPAID', 'ELECTRICITY', 'BBPS'] } }); ensure(operator, 400, 'INVALID_BILL_OPERATOR');
  const provider = await Provider.findOne({ _id: operator.providerId, enabled: true }); ensure(provider, 503, 'PROVIDER_UNAVAILABLE');
  const result = await adapter(provider.code).fetchBill(b.account, operator.code);
  res.status(201).json(await Bill.create({ tenantId: req.user!.tenantId, userId: req.user!._id, operatorId: operator._id, accountHash: hash(b.account), amountMinor: result.amountMinor, providerReference: result.reference, expiresAt: new Date(Date.now() + 900000) }));
}));
billRoutes.use('/', rechargeRoutes);
