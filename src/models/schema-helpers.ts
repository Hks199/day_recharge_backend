import { Schema } from "mongoose";

export const ref = (required = true) => ({
  type: Schema.Types.ObjectId,
  required,
});
export const text = (required = true) => ({
  type: String,
  required,
  trim: true,
});
export const money = {
  type: Number,
  required: true,
  min: 0,
  max: 1_000_000_000_000,
  validate: Number.isSafeInteger,
};
export const options = { timestamps: true, strict: "throw" as const };
