import { z } from 'zod';
export const providerResponse = z.object({ status: z.enum(['SUCCESS', 'FAILED', 'PENDING']), providerTransactionId: z.string().min(1), failureReason: z.string().optional() }).strict();
export type ProviderResult = z.infer<typeof providerResponse>;
export interface ProviderRequest { transactionId: string; account: string; amountMinor: number; serviceType: string; operatorCode: string; billReference?: string }
export interface ProviderAdapter {
  submit(request: ProviderRequest): Promise<ProviderResult>;
  check(request: ProviderRequest): Promise<ProviderResult>;
  fetchBill(account: string, operatorCode: string): Promise<{ amountMinor: number; reference: string }>;
  validateResponse(response: unknown): ProviderResult;
  normalizeError(error: unknown): { code: string; ambiguous: boolean };
  verifyWebhook(rawBody: Buffer, timestamp: string, signature: string): boolean;
}
