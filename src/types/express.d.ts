import type { HydratedDocument, InferSchemaType } from 'mongoose';
import type { User, Tenant } from '../models/index.js';
declare global {
  namespace Express {
    interface Request {
      user?: HydratedDocument<InferSchemaType<typeof User.schema>>;
      tenant?: HydratedDocument<InferSchemaType<typeof Tenant.schema>>;
      sessionId?: string;
      requestId: string;
    }
  }
}
export {};
