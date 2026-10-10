import mongoose, { Schema, model, type InferSchemaType } from "mongoose";
import { roles } from "../constants/index.js";
import { ref, text, options } from "./schema-helpers.js";

const userSchema = new Schema(
  {
    tenantId: { ...ref(false), default: null, ref: "Tenant" },
    name: text(),
    email: { ...text(), lowercase: true },
    phone: text(),
    passwordHash: { ...text(), select: false },
    role: { type: String, enum: roles, required: true },
    parentId: { ...ref(false), default: null, ref: "User" },
    createdBy: { ...ref(false), default: null, ref: "User" },
    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED"],
      default: "ACTIVE",
      required: true,
    },
    lastLoginAt: Date,
  },
  options,
);
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, parentId: 1, role: 1 });
userSchema.pre("validate", async function () {
  if (
    this.role === "DEVELOPER"
      ? this.tenantId !== null || this.parentId !== null
      : !this.tenantId
  )
    throw new Error("Invalid role scope");
  if (this.role === "SUPER_ADMIN" && this.parentId !== null)
    throw new Error("Invalid owner hierarchy");
  if (["DISTRIBUTOR", "RETAILER"].includes(this.role) && !this.parentId)
    throw new Error("Parent required");
  if (this.parentId) {
    const parent = await mongoose.connection
      .collection("users")
      .findOne(
        { _id: this.parentId },
        {
          session: this.$session() ?? undefined,
          projection: { role: 1, tenantId: 1 },
        },
      );
    if (
      !parent ||
      String(parent.tenantId) !== String(this.tenantId) ||
      (this.role === "DISTRIBUTOR"
        ? parent.role !== "SUPER_ADMIN"
        : !["SUPER_ADMIN", "DISTRIBUTOR"].includes(String(parent.role)))
    )
      throw new Error("Invalid parent role or tenant");
  }
});
userSchema.index(
  { tenantId: 1, role: 1 },
  { unique: true, partialFilterExpression: { role: "SUPER_ADMIN" } },
);
export const User = model("User", userSchema, "users");
export type UserData = InferSchemaType<typeof userSchema> & {
  _id: Schema.Types.ObjectId;
};
