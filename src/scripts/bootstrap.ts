import mongoose from 'mongoose';
import { connectDatabase, initializeIndexes } from '../database/index.js';
import { User } from '../models/index.js';
import { passwordHash } from '../modules/auth/service.js';
import { person } from '../validators/index.js';
import { ensure } from '../utils/core.js';
const data = person.parse({ name: process.env.BOOTSTRAP_NAME, email: process.env.BOOTSTRAP_EMAIL, phone: process.env.BOOTSTRAP_PHONE, password: process.env.BOOTSTRAP_PASSWORD });
await connectDatabase();
try {
  await initializeIndexes();
  ensure(!await User.exists({ role: 'DEVELOPER' }), 409, 'DEVELOPER_ALREADY_BOOTSTRAPPED');
  await User.create({ name: data.name, email: data.email, phone: data.phone, passwordHash: await passwordHash(data.password), role: 'DEVELOPER' });
  console.log('Developer created. Clear BOOTSTRAP_PASSWORD from your environment.');
} finally { await mongoose.disconnect(); }
