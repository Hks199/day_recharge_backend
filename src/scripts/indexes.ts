import mongoose from 'mongoose';
import { connectDatabase, initializeIndexes } from '../database/index.js';
await connectDatabase();
try { await initializeIndexes(); } finally { await mongoose.disconnect(); }
