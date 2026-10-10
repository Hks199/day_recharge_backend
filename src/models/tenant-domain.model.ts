import { Schema, model } from "mongoose";
import { ref, text, options } from "./schema-helpers.js";

const domainSchema = new Schema(
  {
    tenantId: ref(),
    hostname: { ...text(), unique: true },
    verificationToken: { ...text(), select: false },
    verifiedAt: Date,
    primary: { type: Boolean, default: false },
  },
  options,
);
domainSchema.index(
  { tenantId: 1, primary: 1 },
  { unique: true, partialFilterExpression: { primary: true } },
);
export const TenantDomain = model(
  "TenantDomain",
  domainSchema,
  "tenant_domains",
);
