import { hash } from '../../utils/core.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../config/index.js';
import { providerResponse } from '../interfaces/index.js';
import type { ProviderAdapter, ProviderRequest, ProviderResult } from '../interfaces/index.js';
export class MockProvider implements ProviderAdapter {
  async submit(request: ProviderRequest): Promise<ProviderResult> {
    if (request.account.endsWith('9999')) throw new Error('MOCK_AMBIGUOUS_TIMEOUT');
    return this.check(request);
  }
  async check(request: ProviderRequest): Promise<ProviderResult> {
    return { status: request.account.endsWith('0000') ? 'FAILED' : /(?:9999|8888)$/.test(request.account) ? 'PENDING' : 'SUCCESS', providerTransactionId: `mock-${request.transactionId}`, ...(request.account.endsWith('0000') ? { failureReason: 'MOCK_DECLINED' } : {}) };
  }
  async fetchBill(account: string, operatorCode: string) { return { amountMinor: 10000, reference: `mock-bill-${hash(account + operatorCode).slice(0, 24)}` }; }
  validateResponse(response: unknown) { return providerResponse.parse(response); }
  normalizeError(_error: unknown) { void _error; return { code: 'MOCK_AMBIGUOUS_PROVIDER_ERROR', ambiguous: true }; }
  verifyWebhook(rawBody: Buffer, timestamp: string, signature: string) {
    if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) >= 300 || !/^[a-f\d]{64}$/i.test(signature)) return false;
    const expected = createHmac('sha256', config.WEBHOOK_SECRET).update(timestamp + '.').update(rawBody).digest();
    return timingSafeEqual(Buffer.from(signature, 'hex'), expected);
  }
}
