import { Schema, model } from "mongoose";
import { ref, text, options } from "./schema-helpers.js";

const resetSchema = new Schema(
  {
    tenantId: { ...ref(false), default: null },
    userId: ref(),
    tokenHash: { ...text(), unique: true, select: false },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  options,
);
resetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PasswordReset = model(
  "PasswordReset",
  resetSchema,
  "password_resets",
);
