import { Schema, model } from "mongoose";
import { ref, text, money, options } from "./schema-helpers.js";

const billSchema = new Schema(
  {
    tenantId: ref(),
    userId: ref(),
    operatorId: ref(),
    accountHash: text(),
    amountMinor: money,
    providerReference: text(),
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
  },
  options,
);
export const Bill = model("Bill", billSchema, "bill_inquiries");
