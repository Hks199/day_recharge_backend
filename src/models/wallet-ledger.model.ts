import { Schema, model } from "mongoose";
import { ref, text, money, options } from "./schema-helpers.js";

const ledgerSchema = new Schema(
  {
    tenantId: ref(),
    walletId: { ...ref(), ref: "Wallet" },
    userId: ref(),
    transactionId: ref(false),
    transferId: ref(false),
    entryType: {
      type: String,
      enum: [
        "DEBIT",
        "CREDIT",
        "REFUND",
        "COMMISSION",
        "COMMISSION_REVERSAL",
        "FUNDING",
        "REVERSAL",
      ],
      required: true,
    },
    amountMinor: money,
    balanceBeforeMinor: money,
    balanceAfterMinor: money,
    reference: text(),
    idempotencyKey: text(),
  },
  { ...options, timestamps: { createdAt: true, updatedAt: false } },
);
ledgerSchema.index(
  { tenantId: 1, walletId: 1, idempotencyKey: 1 },
  { unique: true },
);
ledgerSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
ledgerSchema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
    "replaceOne",
  ],
  function () {
    throw new Error("Ledger is append only");
  },
);
ledgerSchema.pre("save", function () {
  if (!this.isNew) throw new Error("Ledger is append only");
});
ledgerSchema.pre("bulkWrite", function () {
  throw new Error("Ledger is append only");
});
export const Ledger = model("Ledger", ledgerSchema, "wallet_ledger");
