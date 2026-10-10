import { config } from '../config/index.js';
import { AppError } from '../utils/core.js';
import { MockProvider } from './mock/index.js';
import type { ProviderAdapter } from './interfaces/index.js';
export function adapter(code: string): ProviderAdapter {
  if (code === 'MOCK' && config.MOCK_PROVIDER_ENABLED === 'true') return new MockProvider();
  throw new AppError(503, 'PROVIDER_NOT_IMPLEMENTED');
}
