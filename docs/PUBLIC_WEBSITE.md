# Public website content

The frontend gets its public website content from the backend. One `website_content` document contains branding and the text, links, images, colors, and dates for the existing public-page design. Its native unique `_id` index identifies `platform` or `tenant:<tenant ObjectId>`. Public pages load together in one request; navigating between them reuses the frontend query cache.

Backend-owned defaults live in `src/modules/website/defaults.ts`. Existing installations immediately serve these defaults without requiring a migration or a write during a public GET. Saving from the editor creates the document; subsequent saves replace its validated content atomically. New default fields are merged into older saved documents when read. Content keys identify stable slots in the current layout; this editor changes content, not the number of cards or page structure.

## Endpoints

| Method | Platform | Tenant | Access |
| --- | --- | --- | --- |
| GET | `/api/platform/public/website` | `/api/public/website` | Public, validated host/domain |
| GET | `/api/platform/website` | `/api/tenant/website` | DEVELOPER / SUPER_ADMIN respectively |
| PATCH | `/api/platform/website` | `/api/tenant/website` | DEVELOPER / SUPER_ADMIN respectively |

Public responses contain `{ revision, brand, values }`. Editor GET responses additionally include `fields`, which describe editable inputs and their groups. PATCH accepts exactly `{ revision, brand, values }`; use the revision and complete values returned by GET. Successful writes increment the revision. A stale revision returns HTTP 409 and changes nothing. Tenant scope comes exclusively from the existing verified-domain middleware and authenticated identity. Clients cannot select a tenant in the request body.

Editor field definitions include human-readable `label`, `section`, `description`, and optional `placeholder` metadata, maintained in `src/modules/website/editor-metadata.ts`. Stable content keys remain unchanged so existing saved content is compatible. Fields are arranged in public-page order, grouped by visible sections, and searchable by name or location. Internal keys and HTML tag names are not shown as labels. Desktop and mobile navigation buttons have separate, correctly mapped labels.

Terms and Privacy each expose one effective-date input. The API derives the corresponding visible date text on reads and saves; the derived text is included in `values` for compatibility, but omitted from editable field definitions. This keeps the public date label and machine-readable date consistent. A save still accepts the complete values returned by GET.

Brand fields are `name`, `logo`, `tagline`, `primaryColor`, `secondaryColor`, `address`, and `support: { email, phone }`. One logo is used everywhere; the deprecated `authLogo` response alias mirrors it for older clients and is not independently persisted on save. A tenant's initial branding and support come from its existing tenant/settings records. Tenant defaults never inherit the platform's address, email, phone, or logo. Website saves synchronize legacy branding/support records in the same MongoDB transaction, alongside the audit entry. Existing branding/support updates also refresh saved website content and increment its revision.

Navigation destinations are restricted to local public routes. Images accept `/images/...` or HTTPS URLs; reference-site image URLs, credentials in URLs, traversal paths, and active URL schemes are rejected. Text renders through React as plain text, with `{{brand}}` replaced by the business name. No raw HTML is accepted or rendered. Website request bodies have a 256 KB limit; other JSON endpoints retain their 32 KB limit.

## Using the editor

Restart the backend after deploying this code and start the frontend normally. Sign in as the platform owner or a business owner and choose **Public website** in the workspace navigation (`/platform/website` or `/admin/website`). Edit the brand or a page section, then select **Save website**. The current browser updates immediately; other browsers receive the latest content on reload or the next query refresh. Public responses require revalidation (`Cache-Control: no-cache`).

Images can be uploaded directly to the configured S3 bucket or reference existing local `/images/` paths and permitted HTTPS URLs. See [S3 configuration](WEBSITE_IMAGES.md). The contact and account-request forms continue to open an email draft using the backend-configured support address.

Production: run the existing `npm run indexes` deployment command after connecting MongoDB. This registers the new collection along with existing models. No collection drop or destructive migration is required. MongoDB must remain a replica set, as required by the existing backend transactions.

## Image uploads and one shared logo

See [S3 image configuration](WEBSITE_IMAGES.md). The editor now uses one logo across all public and authentication pages, and supports direct S3 uploads for all image fields.
