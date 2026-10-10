export const roles = ['DEVELOPER', 'SUPER_ADMIN', 'DISTRIBUTOR', 'RETAILER'] as const;
export type Role = typeof roles[number];
export const services = ['MOBILE', 'DTH', 'POSTPAID', 'ELECTRICITY', 'BBPS'] as const;
export const states = ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED'] as const;
export type TransactionStatus = typeof states[number];
export const transitions: Record<TransactionStatus, readonly TransactionStatus[]> = {
  PENDING: ['PROCESSING'], PROCESSING: ['SUCCESS', 'FAILED'], SUCCESS: ['REFUNDED'], FAILED: ['REFUNDED'], REFUNDED: []
};
