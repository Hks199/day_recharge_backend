import { Schema, model } from "mongoose";
import { ref, text, options } from "./schema-helpers.js";

const notificationSchema = new Schema(
  {
    tenantId: ref(),
    userId: ref(),
    title: text(),
    message: text(),
    readAt: Date,
    reference: text(false),
  },
  options,
);
notificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
export const Notification = model(
  "Notification",
  notificationSchema,
  "notifications",
);
