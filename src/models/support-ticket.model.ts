import { Schema, model } from "mongoose";
import { ref, text, options } from "./schema-helpers.js";

const ticketSchema = new Schema(
  {
    tenantId: ref(),
    userId: ref(),
    subject: text(),
    message: text(),
    status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN" },
    response: String,
  },
  options,
);
ticketSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
export const Ticket = model("Ticket", ticketSchema, "support_tickets");
