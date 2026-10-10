import { Schema, model } from "mongoose";
import { ref, text, options } from "./schema-helpers.js";

const reconciliationSchema = new Schema(
  {
    tenantId: ref(),
    transactionId: ref(),
    result: text(),
    providerStatus: text(),
    checkedAt: { type: Date, default: Date.now },
  },
  options,
);
reconciliationSchema.index({ tenantId: 1, transactionId: 1, checkedAt: -1 });
export const Reconciliation = model(
  "Reconciliation",
  reconciliationSchema,
  "reconciliation_records",
);
