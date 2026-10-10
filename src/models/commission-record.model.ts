import { Schema, model } from "mongoose";
import { ref, money, options } from "./schema-helpers.js";

const commissionSchema = new Schema(
  {
    tenantId: ref(),
    transactionId: ref(),
    beneficiaryUserId: ref(),
    sourceUserId: ref(),
    amountMinor: money,
    status: { type: String, enum: ["PAID", "REVERSED"], required: true },
  },
  options,
);
commissionSchema.index(
  { tenantId: 1, transactionId: 1, beneficiaryUserId: 1 },
  { unique: true },
);
export const Commission = model(
  "Commission",
  commissionSchema,
  "commission_records",
);
