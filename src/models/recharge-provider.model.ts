import { Schema, model } from "mongoose";
import { text, options } from "./schema-helpers.js";

const providerSchema = new Schema(
  {
    name: text(),
    code: { ...text(), unique: true },
    enabled: { type: Boolean, default: false },
    credentialEnvPrefix: text(false),
  },
  options,
);
export const Provider = model("Provider", providerSchema, "recharge_providers");
