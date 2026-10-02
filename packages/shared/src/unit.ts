import { z } from 'zod';
import { UnitCode } from './common.js';

export const UnitKind = z.enum(['mass', 'volume', 'count']);
export type UnitKind = z.infer<typeof UnitKind>;

export const Unit = z.object({
  code: UnitCode,
  name: z.string(),
  kind: UnitKind,
});
export type Unit = z.infer<typeof Unit>;

export const UnitList = z.object({ items: z.array(Unit) });
export type UnitList = z.infer<typeof UnitList>;
