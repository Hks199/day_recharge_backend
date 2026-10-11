import { z } from "zod";
import { defaultValues, websiteFields } from "./defaults.js";
export const publicPaths = [
  "/",
  "/aboutus",
  "/contactus",
  "/terms",
  "/term",
  "/privacy",
  "/login",
  "/register",
];
export const imageUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    if (/^\/images\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes(".."))
      return true;
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !/(^|\.)dayrecharge\.com$/i.test(url.hostname)
      );
    } catch {
      return false;
    }
  }, "Use a local /images/ path or an HTTPS image URL (not dayrecharge.com).");
const color = z.string().regex(/^#[a-f\d]{6}$/i);
export const websiteBrandSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    logo: imageUrl.or(z.literal("")),
    authLogo: imageUrl.or(z.literal("")),
    tagline: z.string().max(150),
    primaryColor: color,
    secondaryColor: color,
    address: z.string().max(1000),
    support: z
      .object({
        email: z.email().max(254).or(z.literal("")),
        phone: z.string().regex(/^[+\d ()-]{0,30}$/),
      })
      .strict(),
  })
  .strict();
const valueShape: Record<string, z.ZodType<string>> = {};
for (const field of websiteFields)
  valueShape[field.key] =
    field.type === "link"
      ? z
          .string()
          .refine((v) => publicPaths.includes(v), "Choose a local public page.")
      : field.type === "image"
        ? imageUrl
        : field.type === "color"
          ? color
          : field.type === "date"
            ? z.iso.date()
            : z.string().max(5000);
export const websiteValuesSchema = z.object(valueShape).strict();
export const websiteInput = z
  .object({
    revision: z.number().int().min(0),
    brand: websiteBrandSchema,
    values: websiteValuesSchema,
  })
  .strict();
export type WebsiteBrand = z.infer<typeof websiteBrandSchema>;
export { defaultValues, websiteFields };
