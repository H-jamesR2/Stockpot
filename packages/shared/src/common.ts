import { z } from 'zod';

export const Uuid = z.uuid();

export const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Invalid slug');

/** Calendar date as YYYY-MM-DD. Kept as a string end to end to avoid timezone drift. */
export const IsoDate = z.iso.date();

/** Unit codes are validated against the units table by the database. */
export const UnitCode = z.string().trim().min(1).max(16);

export const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const IdParams = z.object({ id: Uuid });
export const SlugParams = z.object({ slug: Slug });

export const ErrorResponse = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
