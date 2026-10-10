import type { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../../config/index.js';
import { Provider, Transaction, WebhookEvent } from '../../models/index.js';
import { ensure, atomic, hash, oid } from '../../utils/core.js';
import { providerResponse } from '../../providers/interfaces/index.js';
import { finalize } from './service.js';
import { adapter } from '../../providers/index.js';
export async function webhook(req: Request, res: Response) {
  ensure(config.MOCK_PROVIDER_ENABLED === 'true' && Buffer.isBuffer(req.body), 404, 'WEBHOOK_UNAVAILABLE');
  const timestamp = req.get('X-Webhook-Timestamp') ?? '', signature = req.get('X-Webhook-Signature') ?? '';
  ensure(/^\d{10}$/.test(timestamp) && Math.abs(Date.now() / 1000 - Number(timestamp)) < 300, 401, 'WEBHOOK_EXPIRED');
  ensure(adapter('MOCK').verifyWebhook(req.body as Buffer, timestamp, signature), 401, 'WEBHOOK_SIGNATURE_INVALID');
  let parsed: unknown; try { parsed = JSON.parse((req.body as Buffer).toString('utf8')); } catch { ensure(false, 400, 'INVALID_JSON'); }
  const payload = z.object({ eventId: z.string().min(8).max(128), transactionId: z.string().regex(/^[a-f\d]{24}$/i), result: providerResponse }).strict().parse(parsed);
  const provider = await Provider.findOne({ code: 'MOCK' }); ensure(provider, 404, 'PROVIDER_NOT_FOUND');
  const transaction = await Transaction.findOne({ _id: oid(payload.transactionId), providerId: provider._id }); ensure(transaction, 404, 'TRANSACTION_NOT_FOUND');
  const digest = hash((req.body as Buffer).toString('utf8'));
  const existing = await WebhookEvent.findOne({ providerId: provider._id, eventId: payload.eventId });
  if (existing) { ensure(existing.payloadHash === digest, 409, 'WEBHOOK_EVENT_CONFLICT'); res.json({ accepted: true, duplicate: true }); return; }
  try {
    await atomic(async session => {
      await WebhookEvent.create([{ tenantId: transaction.tenantId, providerId: provider._id, eventId: payload.eventId, transactionId: transaction._id, payloadHash: digest }], { session });
      await finalize(payload.transactionId, payload.result, session);
    });
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
    const event = await WebhookEvent.findOne({ providerId: provider._id, eventId: payload.eventId }); ensure(event?.payloadHash === digest, 409, 'WEBHOOK_EVENT_CONFLICT');
  }
  res.json({ accepted: true });
}
