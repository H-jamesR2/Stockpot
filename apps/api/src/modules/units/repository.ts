import type { Unit } from '@stockpot/shared';
import type { Database } from '../../db/index.js';

export class UnitRepository {
  constructor(private readonly db: Database) {}

  /** Grouped by kind, smallest first within a kind, with ingredient-specific units (no to_base) last. */
  async list(): Promise<Unit[]> {
    return this.db
      .selectFrom('units')
      .select(['code', 'name', 'kind'])
      .orderBy('kind')
      .orderBy('to_base', (ob) => ob.asc().nullsLast())
      .orderBy('code')
      .execute();
  }
}
