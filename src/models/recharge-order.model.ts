import { Schema, model } from "mongoose";
import { ref, text, money, options } from "./schema-helpers.js";

const orderSchema = new Schema(
  {
    tenantId: ref(),
    transactionId: { ...ref(), unique: true },
    account: { ...text(), select: false },
    billReference: String,
    commissionSnapshot: {
      type: [{ beneficiaryUserId: ref(), amountMinor: money }],
      default: [],
    },
    dispatchAt: Date,
    lastCheckedAt: Date,
    leaseUntil: Date,
    leaseToken: String,
  },
  options,
);
export const RechargeOrder = model(
  "RechargeOrder",
  orderSchema,
  "recharge_orders",
);
