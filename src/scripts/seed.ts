import mongoose from 'mongoose';
import { connectDatabase, initializeIndexes } from '../database/index.js';
import { Plan, Provider, Operator } from '../models/index.js';
import { config } from '../config/index.js';
import { services } from '../constants/index.js';
import { ensure } from '../utils/core.js';
ensure(config.NODE_ENV !== 'production' && config.MOCK_PROVIDER_ENABLED === 'true', 403, 'DEVELOPMENT_SEED_ONLY');
await connectDatabase();
try {
  await initializeIndexes();
  const provider = await Provider.findOneAndUpdate({ code: 'MOCK' }, { $setOnInsert: { name: 'Development Mock', code: 'MOCK', enabled: true } }, { upsert: true, returnDocument: 'after' });
  for (const serviceType of services) await Operator.updateOne({ code: `MOCK_${serviceType}` }, { $setOnInsert: { name: `Mock ${serviceType}`, code: `MOCK_${serviceType}`, providerId: provider._id, serviceType, minMinor: 1000, maxMinor: 1000000, commissionBudgetBps: 500, enabled: true } }, { upsert: true });
  if (!await Plan.exists({ name: 'Development' })) await Plan.create({ name: 'Development', priceMinor: 0, durationDays: 30, features: ['mobile', 'dth', 'bills'] });
  console.log('Mock provider, operators and development plan seeded. No accounts or balances created.');
} finally { await mongoose.disconnect(); }
