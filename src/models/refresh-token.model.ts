import { Schema, model } from "mongoose";
import { ref, text, options } from "./schema-helpers.js";

const sessionSchema = new Schema(
  {
    tenantId: { ...ref(false), default: null },
    userId: ref(),
    family: text(),
    tokenHash: { ...text(), unique: true, select: false },
    csrfHash: { ...text(), select: false },
    usedAt: Date,
    revokedAt: Date,
    expiresAt: { type: Date, required: true },
  },
  options,
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, family: 1 });
export const Session = model("Session", sessionSchema, "refresh_tokens");
