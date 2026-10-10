import { Schema, model } from "mongoose";
import { services } from "../constants/index.js";
import { ref, money, options } from "./schema-helpers.js";

const ruleSchema = new Schema(
  {
    tenantId: ref(),
    serviceType: { type: String, enum: services, required: true },
    operatorId: ref(),
    beneficiaryRole: {
      type: String,
      enum: ["SUPER_ADMIN", "DISTRIBUTOR", "RETAILER"],
      required: true,
    },
    calculationType: {
      type: String,
      enum: ["FIXED", "PERCENTAGE"],
      required: true,
    },
    commissionValue: money,
    effectiveFrom: { type: Date, required: true },
    effectiveTo: Date,
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  options,
);
ruleSchema.index({
  tenantId: 1,
  operatorId: 1,
  beneficiaryRole: 1,
  effectiveFrom: -1,
});
export const CommissionRule = model(
  "CommissionRule",
  ruleSchema,
  "commission_rules",
);
