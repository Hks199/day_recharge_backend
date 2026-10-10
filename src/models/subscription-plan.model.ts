import { Schema, model } from "mongoose";
import { text, money, options } from "./schema-helpers.js";

const planSchema = new Schema(
  {
    name: text(),
    priceMinor: money,
    durationDays: {
      type: Number,
      min: 1,
      required: true,
      validate: Number.isSafeInteger,
    },
    features: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  options,
);
export const Plan = model("Plan", planSchema, "subscription_plans");
