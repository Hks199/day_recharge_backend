import { Schema, model } from "mongoose";
import { ref, text, money, options } from "./schema-helpers.js";

const transferSchema = new Schema(
  {
    tenantId: ref(),
    fromUserId: ref(),
    toUserId: ref(),
    amountMinor: money,
    idempotencyKey: text(),
    reversedAt: Date,
    reversedBy: ref(false),
  },
  options,
);
transferSchema.index(
  { tenantId: 1, fromUserId: 1, idempotencyKey: 1 },
  { unique: true },
);
export const Transfer = model("Transfer", transferSchema, "wallet_transfers");
