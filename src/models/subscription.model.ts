import { Schema, model } from "mongoose";
import { ref, options } from "./schema-helpers.js";

const subscriptionSchema = new Schema(
  {
    tenantId: ref(),
    planId: { ...ref(), ref: "Plan" },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "CANCELLED"],
      required: true,
    },
  },
  options,
);
subscriptionSchema.index({ tenantId: 1, endAt: -1 });
export const Subscription = model(
  "Subscription",
  subscriptionSchema,
  "subscriptions",
);
