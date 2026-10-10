import { Schema, model } from "mongoose";
import { ref, text, options } from "./schema-helpers.js";

const webhookSchema = new Schema(
  {
    tenantId: ref(),
    providerId: ref(),
    eventId: text(),
    transactionId: ref(),
    payloadHash: text(),
    receivedAt: { type: Date, default: Date.now },
  },
  options,
);
webhookSchema.index({ providerId: 1, eventId: 1 }, { unique: true });
export const WebhookEvent = model(
  "WebhookEvent",
  webhookSchema,
  "provider_webhook_events",
);
