import { Schema, model } from "mongoose";
import { ref, text, options } from "./schema-helpers.js";

const idempotencySchema = new Schema(
  {
    tenantId: ref(),
    userId: ref(),
    scope: text(),
    key: text(),
    requestHash: text(),
    resourceId: ref(),
  },
  options,
);
idempotencySchema.index(
  { tenantId: 1, userId: 1, scope: 1, key: 1 },
  { unique: true },
);
export const Idempotency = model(
  "Idempotency",
  idempotencySchema,
  "idempotency_records",
);
