import { Schema, model } from "mongoose";
import { ref, text, money, options } from "./schema-helpers.js";

const fundingSchema = new Schema(
  {
    tenantId: ref(),
    userId: ref(),
    amountMinor: money,
    reference: text(),
    status: {
      type: String,
      enum: ["REQUESTED", "APPROVED", "REJECTED"],
      default: "REQUESTED",
    },
    decidedBy: ref(false),
    decidedAt: Date,
  },
  options,
);
fundingSchema.index({ tenantId: 1, reference: 1 }, { unique: true });
export const FundingRequest = model(
  "FundingRequest",
  fundingSchema,
  "funding_requests",
);
