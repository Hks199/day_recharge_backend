import { Schema, model } from "mongoose";
import { services, states } from "../constants/index.js";
import { ref, text, money, options } from "./schema-helpers.js";

const transactionSchema = new Schema(
  {
    tenantId: ref(),
    userId: ref(),
    walletId: ref(),
    serviceType: { type: String, enum: services, required: true },
    operatorId: ref(),
    amountMinor: money,
    status: { type: String, enum: states, default: "PENDING", required: true },
    providerId: ref(),
    providerTransactionId: String,
    idempotencyKey: text(),
    failureReason: String,
    commissionBudgetMinor: money,
  },
  options,
);
transactionSchema.index(
  { tenantId: 1, userId: 1, idempotencyKey: 1 },
  { unique: true },
);
transactionSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, updatedAt: 1 });
export const Transaction = model(
  "Transaction",
  transactionSchema,
  "transactions",
);
