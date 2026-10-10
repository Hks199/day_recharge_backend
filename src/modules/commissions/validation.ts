import { z } from 'zod';
import { id, service } from '../../validators/index.js';
export const ruleInput = z.object({ serviceType: service, operatorId: id, beneficiaryRole: z.enum(['SUPER_ADMIN', 'DISTRIBUTOR', 'RETAILER']), calculationType: z.enum(['FIXED', 'PERCENTAGE']), commissionValue: z.number().int().min(0).max(10000), effectiveFrom: z.coerce.date(), effectiveTo: z.coerce.date().optional() }).strict();
