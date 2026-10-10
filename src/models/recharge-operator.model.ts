import { Schema, model } from "mongoose";
import { services } from "../constants/index.js";
import { ref, text, money, options } from "./schema-helpers.js";

const operatorSchema = new Schema(
  {
    name: text(),
    code: { ...text(), unique: true },
    serviceType: { type: String, enum: services, required: true },
    providerId: ref(),
    minMinor: money,
    maxMinor: money,
    commissionBudgetBps: {
      type: Number,
      min: 0,
      max: 10000,
      required: true,
      validate: Number.isSafeInteger,
    },
    enabled: { type: Boolean, default: true },
  },
  options,
);
export const Operator = model("Operator", operatorSchema, "recharge_operators");
