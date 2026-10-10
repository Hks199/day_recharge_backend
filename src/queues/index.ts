import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import { Outbox, Transaction } from '../models/index.js';
export function redisConnection() {
  const url = new URL(config.REDIS_URL);
  return { host: url.hostname, port: Number(url.port || 6379), db: Number(url.pathname.slice(1) || 0), ...(url.username ? { username: decodeURIComponent(url.username) } : {}), ...(url.password ? { password: decodeURIComponent(url.password) } : {}), ...(url.protocol === 'rediss:' ? { tls: {} } : {}), maxRetriesPerRequest: null };
}
export function createRechargeQueue() { return new Queue('recharges', { connection: redisConnection(), prefix: config.QUEUE_PREFIX }); }
export async function dispatchOutbox(queue: Queue) {
  const events = await Outbox.find({ deliveredAt: null }).sort({ createdAt: 1 }).limit(100);
  for (const event of events) {
    await queue.add('submit', { transactionId: String(event.transactionId) }, { jobId: String(event.transactionId), attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 });
    await Outbox.updateOne({ _id: event._id }, { $set: { deliveredAt: new Date() } });
  }
}
export async function enqueueRecovery(queue: Queue) {
  const stale = await Transaction.find({ status: { $in: ['PENDING', 'PROCESSING'] }, updatedAt: { $lt: new Date(Date.now() - 60000) } }).limit(100);
  for (const transaction of stale) await queue.add('reconcile', { transactionId: String(transaction._id) }, { jobId: `recover-${transaction._id}-${Math.floor(Date.now() / 60000)}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 });
}
