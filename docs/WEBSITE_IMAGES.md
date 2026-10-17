# Website images on S3

The editor has one logo, used in the header, footer, login and registration pages. Old `authLogo` input is accepted for compatibility but ignored; it is removed from a website document on its next save. The public API's deprecated `authLogo` property mirrors `logo` for older clients.

Configure the backend environment (not frontend `VITE_` variables):

```dotenv
S3_REGION=ap-south-1
S3_BUCKET=your-bucket-name
S3_PUBLIC_BASE_URL=https://images.example.com
```

Set these to your actual bucket region, bucket name and public image base URL, then restart the API. The base URL maps to the bucket root; an optional CDN path prefix must map to that same root. Do not use an expiring signed download URL. The SDK uses the standard AWS credential chain: prefer an IAM role in production; a local AWS profile or `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and optional `AWS_SESSION_TOKEN` also work. Never expose those credentials in frontend environment variables.

The backend IAM identity needs `s3:PutObject` on `arn:aws:s3:::YOUR_BUCKET/website/*`. It does not need bucket administration, object deletion, or public ACL permissions. No ACL is sent. For serving images, use CloudFront with origin access control and a private S3 bucket, or separately configure public read access only for the website prefix. The application does not change bucket policies or create AWS resources.

Set this bucket CORS configuration, adding the actual deployed platform and tenant editor origins:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5179", "http://platform.localhost:5179"],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 300
  }
]
```

AWS references: [bucket CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html), [Node SDK credentials](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).

## Upload and publish

Only Developer (platform) and Super Admin (their own tenant) can request uploads. POST `/api/platform/website/images/upload` or `/api/tenant/website/images/upload` with `{ "field": "logo", "contentType": "image/png", "size": 1234 }`; other website fields must be registered image fields. Returns `{ url, fields, publicUrl, expiresIn }`. The browser posts the returned fields and file directly to S3, without API tokens or cookies, then places `publicUrl` into the draft. Save website to persist the URL and publish it. Until then, the previous published content is retained.

Each authorization expires after 120 seconds and restricts the exact generated key, declared content type, declared size (1 byte to 5 MiB), cache headers and response status. Keys use `website/platform/<uuid>.<ext>` or `website/tenants/<server-resolved-id>/<uuid>.<ext>`; callers cannot choose a bucket, tenant ID or object key. Supported types: PNG, JPEG, WebP, GIF; SVG is not accepted. These policies validate size and MIME metadata, not the actual file contents; this flow is intended for trusted website owners, not public user uploads. Upload authorizations are audited; authorization does not prove completion.

The app stores only URLs in MongoDB. Previously uploaded/replaced images are retained, including uploads abandoned before saving. Review unused objects through a separate retention process; do not configure a blanket expiry on published images. Serve images from a separate image origin. Missing settings return `IMAGE_STORAGE_NOT_CONFIGURED`; signing or credential errors return `IMAGE_STORAGE_UNAVAILABLE`. On upload failure the draft keeps its previous image URL. Existing local paths or HTTPS image URLs remain usable without S3.
