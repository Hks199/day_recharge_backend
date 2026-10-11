import { Schema, model } from "mongoose";
import { options } from "./schema-helpers.js";
// Native unique _id index: one document for platform or tenant:<id>.
const schema = new Schema(
  {
    _id: { type: String, required: true },
    revision: { type: Number, required: true, default: 0 },
    brand: { type: Schema.Types.Mixed, required: true },
    values: { type: Schema.Types.Mixed, required: true },
  },
  options,
);
export const WebsiteContent = model(
  "WebsiteContent",
  schema,
  "website_content",
);
