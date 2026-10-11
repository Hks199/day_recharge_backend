import type { Request } from "express";
import { WebsiteContent } from "../../models/website-content.model.js";
import {
  PlatformSettings,
  TenantSettings,
  Tenant,
  Audit,
} from "../../models/index.js";
import {
  defaultValues,
  websiteFields,
  websiteInput,
  type WebsiteBrand,
} from "./schema.js";
import { ensure, atomic } from "../../utils/core.js";
export const websiteScope = (req: Request) =>
  req.tenant ? `tenant:${req.tenant._id}` : "platform";
export async function readWebsite(req: Request, editor = false) {
  const tenant = req.tenant;
  const document = await WebsiteContent.findById(websiteScope(req)).lean();
  // Saved sites require one indexed lookup; legacy settings are only read for defaults.
  const settings = document
    ? null
    : tenant
      ? await TenantSettings.findOne({ tenantId: tenant._id }).lean()
      : await PlatformSettings.findOne({ key: "GLOBAL" }).lean();
  const brand: WebsiteBrand = document?.brand ?? {
    name: tenant?.name ?? "Day Recharge",
    logo: tenant
      ? (tenant.branding?.logo ?? "")
      : "/images/day-recharge-logo.jpg",
    authLogo: tenant
      ? (tenant.branding?.logo ?? "")
      : "/images/day-recharge-login-logo.png",
    tagline: "RECHARGE. CONNECT. GROW.",
    primaryColor: tenant?.branding?.primaryColor ?? "#2563eb",
    secondaryColor: tenant?.branding?.secondaryColor ?? "#0d9488",
    address: tenant ? "" : "Ravi Shankar Nagar Korba Chhattisgarh Pin - 495677",
    support: {
      email: settings?.supportEmail ?? (tenant ? "" : "dayrecharge@gmail.com"),
      phone:
        tenant && settings && "supportPhone" in settings
          ? (settings.supportPhone ?? "")
          : tenant
            ? ""
            : "7828222210",
    },
  };
  return {
    revision: document?.revision ?? 0,
    brand,
    values: { ...defaultValues, ...document?.values },
    ...(editor ? { fields: websiteFields } : {}),
  };
}
export async function saveWebsite(req: Request) {
  const data = websiteInput.parse(req.body);
  await atomic(async (session) => {
    const result = await WebsiteContent.findOneAndUpdate(
      { _id: websiteScope(req), revision: data.revision },
      {
        $set: { brand: data.brand, values: data.values },
        $inc: { revision: 1 },
      },
      {
        upsert: data.revision === 0,
        returnDocument: "after",
        runValidators: true,
        session,
      },
    );
    ensure(result, 409, "WEBSITE_VERSION_CONFLICT");
    if (req.tenant) {
      await Tenant.updateOne(
        { _id: req.tenant._id },
        {
          $set: {
            branding: {
              logo: data.brand.logo,
              primaryColor: data.brand.primaryColor,
              secondaryColor: data.brand.secondaryColor,
            },
          },
        },
        { session },
      );
      await TenantSettings.updateOne(
        { tenantId: req.tenant._id },
        {
          $set: {
            supportEmail: data.brand.support.email,
            supportPhone: data.brand.support.phone,
          },
        },
        { session },
      );
    } else
      await PlatformSettings.updateOne(
        { key: "GLOBAL" },
        { $set: { supportEmail: data.brand.support.email } },
        { session },
      );
    await Audit.create(
      [
        {
          tenantId: req.tenant?._id,
          actorId: req.user!._id,
          action: "WEBSITE_UPDATE",
          targetId: websiteScope(req),
          requestId: req.requestId,
        },
      ],
      { session },
    );
  });
  return readWebsite(req, true);
}
