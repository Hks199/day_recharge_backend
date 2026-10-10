import { Schema, model } from "mongoose";
import { ref, text, options } from "./schema-helpers.js";

const auditSchema = new Schema(
  {
    tenantId: { ...ref(false), default: null },
    actorId: ref(false),
    action: text(),
    targetId: String,
    requestId: String,
  },
  { ...options, timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ tenantId: 1, createdAt: -1 });
export const Audit = model("Audit", auditSchema, "audit_logs");
