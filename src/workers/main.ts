import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { connectDatabase } from '../database/index.js';
import { createRechargeQueue, redisConnection, dispatchOutbox, enqueueRecovery } from '../queues/index.js';
import { processRecharge } from '../modules/recharges/service.js';
import { expireSubscriptions } from '../modules/platform/service.js';
import { logger } from '../utils/core.js';
import { config } from '../config/index.js';

await connectDatabase();
const queue = createRechargeQueue();
const worker = new Worker<{ transactionId: string }>('recharges', async job => { await processRecharge(job.data.transactionId); }, { connection: redisConnection(), prefix: config.QUEUE_PREFIX, concurrency: 10 });
worker.on('error', error => logger.error({ message: error.message }, 'Worker error'));
worker.on('failed', job => logger.warn({ jobId: job?.id }, 'Job needs reconciliation'));
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try { await dispatchOutbox(queue); await enqueueRecovery(queue); await expireSubscriptions(); }
  catch (error) { logger.error({ message: error instanceof Error ? error.message : 'unknown' }, 'Recovery tick failed'); }
  finally { busy = false; }
}
const timer = setInterval(() => { void tick(); }, 10000);
await tick();
async function shutdown() { clearInterval(timer); await worker.close(); await queue.close(); await mongoose.disconnect(); }
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
