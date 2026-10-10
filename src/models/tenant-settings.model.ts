import { Schema, model } from "mongoose";
import { services } from "../constants/index.js";
import { ref, options } from "./schema-helpers.js";

const settingsSchema = new Schema(
  {
    tenantId: { ...ref(), unique: true },
    publicFeatures: { type: [String], default: [] },
    enabledServices: { type: [String], enum: services, default: [...services] },
    supportEmail: String,
    supportPhone: String,
  },
  options,
);
export const TenantSettings = model(
  "TenantSettings",
  settingsSchema,
  "tenant_settings",
);
