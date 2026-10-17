import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

vi.mock('../src/config/index.js', () => ({ config: {
  S3_REGION: 'ap-south-1', S3_BUCKET: 'test-images', S3_PUBLIC_BASE_URL: 'https://images.example.test',
  LOG_LEVEL: 'silent',
} }));
vi.mock('../src/models/index.js', () => ({ Audit: { create: vi.fn().mockResolvedValue({}) } }));
import { config } from '../src/config/index.js';
import { createImageUpload, uploadInput } from '../src/modules/website/uploads.js';

const valid = { field: 'logo', contentType: 'image/png', size: 1024 };
const request = (tenant?: string) => ({ body: valid, user: { _id: 'test-owner' }, requestId: 'test-request', ...(tenant ? { tenant: { _id: tenant } } : {}) }) as unknown as Request;
beforeEach(() => {
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'isolated-test-access-key');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'isolated-test-secret-key');
  config.S3_PUBLIC_BASE_URL = 'https://images.example.test';
});
afterEach(() => vi.unstubAllEnvs());

describe('Website image upload policies', () => {
  it('creates scoped, short-lived POST policies without contacting S3', async () => {
    const platform = await createImageUpload(request());
    const tenant = await createImageUpload(request('tenant-a'));
    expect(platform.fields.key).toMatch(/^website\/platform\/[\w-]+\.png$/);
    expect(tenant.fields.key).toMatch(/^website\/tenants\/tenant-a\/[\w-]+\.png$/);
    expect(platform.fields.key).not.toBe(tenant.fields.key);
    expect(platform.publicUrl).toBe(`https://images.example.test/${platform.fields.key}`);
    expect(platform.expiresIn).toBe(120);
    const policy = JSON.parse(Buffer.from(platform.fields.Policy!, 'base64').toString());
    expect(policy.conditions).toContainEqual(['content-length-range', 1024, 1024]);
    expect(policy.conditions).toContainEqual(['eq', '$Content-Type', 'image/png']);
    expect(new Date(policy.expiration).getTime() - Date.now()).toBeLessThanOrEqual(120000);
    expect(platform.fields.acl).toBeUndefined();
  });
  it('rejects unsafe formats, oversized files, arbitrary keys and non-image fields', () => {
    for (const body of [
      { ...valid, contentType: 'image/svg+xml' }, { ...valid, size: 5242881 },
      { ...valid, size: 0 }, { ...valid, key: 'other-tenant/logo.png' },
      { ...valid, field: 'home.h1.53' }, { ...valid, tenantId: 'other-tenant' },
    ]) expect(uploadInput.safeParse(body).success).toBe(false);
  });
  it('reports missing or unsafe public image configuration before signing', async () => {
    for (const base of ['', 'http://images.example.test', 'https://images.example.test?token=temporary']) {
      config.S3_PUBLIC_BASE_URL = base;
      await expect(createImageUpload(request())).rejects.toMatchObject({ code: 'IMAGE_STORAGE_NOT_CONFIGURED', status: 503 });
    }
  });
});
