import { z } from 'zod';
import { service, id, amount } from '../../validators/index.js';
export const rechargeInput = z.object({ serviceType: service, operatorId: id, account: z.string().regex(/^[A-Za-z0-9@._-]{5,64}$/), amountMinor: amount, billId: id.optional() }).strict();
