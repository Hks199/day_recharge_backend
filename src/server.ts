import mongoose from 'mongoose';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDatabase } from './database/index.js';
import { createRechargeQueue } from './queues/index.js';
import { logger } from './utils/core.js';
await connectDatabase();
const queue = createRechargeQueue();
queue.on('error', error => logger.error({ message: error.message }, 'Queue unavailable'));
const app = createApp(async () => { await queue.getJobCounts(); });
const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'API listening'));
async function shutdown() {
  const deadline = setTimeout(() => { process.exit(1); }, 15000); deadline.unref();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await queue.close(); await mongoose.disconnect(); clearTimeout(deadline);
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
