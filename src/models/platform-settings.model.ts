import { Schema, model } from "mongoose";
import { services } from "../constants/index.js";
import { money, options } from "./schema-helpers.js";

const platformSettingsSchema = new Schema(
  {
    key: { type: String, enum: ["GLOBAL"], unique: true, required: true },
    enabledServices: { type: [String], enum: services, default: [...services] },
    maxRechargeMinor: { ...money, default: 1_000_000_000 },
    supportEmail: String,
  },
  options,
);
export const PlatformSettings = model(
  "PlatformSettings",
  platformSettingsSchema,
  "platform_settings",
);
