import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { z } from 'zod';
import { config } from '../../config/index.js';
import { Audit } from '../../models/index.js';
import { AppError, ensure } from '../../utils/core.js';
import { imageUrl, websiteFields } from './schema.js';

export const uploadInput = z.object({
  field: z.string().refine(value => value === 'logo' || websiteFields.some(field => field.key === value && field.type === 'image'), 'Choose a website image field.'),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  size: z.number().int().min(1).max(5 * 1024 * 1024),
}).strict();
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' } as const;
let client: S3Client | undefined;

export async function createImageUpload(req: Request) {
  const data = uploadInput.parse(req.body);
  ensure(config.S3_REGION && config.S3_BUCKET && config.S3_PUBLIC_BASE_URL, 503, 'IMAGE_STORAGE_NOT_CONFIGURED');
  const base = config.S3_PUBLIC_BASE_URL.replace(/\/+$/, '');
  const parsedBase = imageUrl.safeParse(base);
  ensure(parsedBase.success && base.startsWith('https://') && !new URL(base).search && !new URL(base).hash, 503, 'IMAGE_STORAGE_NOT_CONFIGURED');
  const scope = req.tenant ? `tenants/${req.tenant._id}` : 'platform';
  const key = `website/${scope}/${randomUUID()}.${extensions[data.contentType]}`;
  let signed;
  try {
    client ??= new S3Client({ region: config.S3_REGION });
    signed = await createPresignedPost(client, {
      Bucket: config.S3_BUCKET,
      Key: key,
      Expires: 120,
      Fields: { 'Content-Type': data.contentType, 'Cache-Control': 'public, max-age=31536000, immutable', success_action_status: '204' },
      Conditions: [
        ['eq', '$Content-Type', data.contentType],
        ['content-length-range', data.size, data.size],
        ['eq', '$Cache-Control', 'public, max-age=31536000, immutable'],
        ['eq', '$success_action_status', '204'],
      ],
    });
  } catch {
    throw new AppError(503, 'IMAGE_STORAGE_UNAVAILABLE');
  }
  await Audit.create({ tenantId: req.tenant?._id, actorId: req.user!._id, action: 'WEBSITE_IMAGE_UPLOAD_AUTHORIZED', targetId: key, requestId: req.requestId });
  return { ...signed, publicUrl: `${base}/${key}`, expiresIn: 120 };
}
