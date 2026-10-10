import { Schema, model } from "mongoose";
import { ref, money, options } from "./schema-helpers.js";

const walletSchema = new Schema(
  {
    tenantId: ref(),
    userId: { ...ref(), ref: "User" },
    currency: { type: String, enum: ["INR"], default: "INR", required: true },
    balanceMinor: { ...money, default: 0 },
    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED"],
      default: "ACTIVE",
      required: true,
    },
  },
  options,
);
walletSchema.index({ tenantId: 1, userId: 1, currency: 1 }, { unique: true });
export const Wallet = model("Wallet", walletSchema, "wallets");
