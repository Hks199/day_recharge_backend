import { Schema, model } from "mongoose";
import { ref, options } from "./schema-helpers.js";

const outboxSchema = new Schema(
  {
    tenantId: ref(),
    transactionId: { ...ref(), unique: true },
    deliveredAt: Date,
  },
  options,
);
outboxSchema.index({ deliveredAt: 1, createdAt: 1 });
export const Outbox = model("Outbox", outboxSchema, "outbox");
