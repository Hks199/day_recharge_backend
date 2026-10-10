import mongoose from 'mongoose';
import { config } from '../config/index.js';
import '../models/index.js';
export async function connectDatabase() {
  // Queries are built from validated primitives; no user-supplied query objects are accepted.
  mongoose.set('strictQuery', 'throw');
  await mongoose.connect(config.MONGODB_URI, { autoIndex: config.NODE_ENV !== 'production', serverSelectionTimeoutMS: 10000 });
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('MongoDB replica set or sharded cluster required');
}
export async function initializeIndexes() {
  for (const model of Object.values(mongoose.models)) await model.createIndexes();
}
