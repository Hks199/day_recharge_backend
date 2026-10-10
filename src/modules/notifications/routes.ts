import { Router } from 'express';
import { wrap } from '../../middleware/security.js';
import { Notification } from '../../models/index.js';
import { page } from '../../validators/index.js';
import { oid, ensure } from '../../utils/core.js';
export const notificationRoutes = Router();
notificationRoutes.get('/', wrap(async (req, res) => { const p = page(req); res.json(await Notification.find({ tenantId: req.user!.tenantId, userId: req.user!._id }).sort({ createdAt: -1 }).skip((p.page - 1) * p.limit).limit(p.limit)); }));
notificationRoutes.patch('/:id/read', wrap(async (req, res) => { const notification = await Notification.findOneAndUpdate({ _id: oid(String(req.params.id)), tenantId: req.user!.tenantId, userId: req.user!._id }, { $set: { readAt: new Date() } }, { returnDocument: 'after' }); ensure(notification, 404, 'NOTIFICATION_NOT_FOUND'); res.json(notification); }));
