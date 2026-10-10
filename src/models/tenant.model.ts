import { Schema, model } from "mongoose";
import { ref, text, options } from "./schema-helpers.js";

const tenantSchema = new Schema(
  {
    name: text(),
    slug: { ...text(), unique: true },
    ownerId: { ...ref(), ref: "User" },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED"],
      default: "ACTIVE",
      required: true,
    },
    branding: {
      logo: String,
      primaryColor: { type: String, default: "#2563eb" },
      secondaryColor: { type: String, default: "#0f172a" },
    },
    contactDetails: { email: String, phone: String },
    subscriptionId: { ...ref(false), ref: "Subscription" },
  },
  options,
);
export const Tenant = model("Tenant", tenantSchema, "tenants");
