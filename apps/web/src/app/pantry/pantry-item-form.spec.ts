import { emptyFormValue, formValueFromItem, toCreateBody, toUpdateBody } from './pantry-item-form';
import { pantryItem } from './test-data';

const ingredientId = '00000000-0000-4000-8000-000000000001';

describe('toCreateBody', () => {
  it('leaves expiry out so the API estimates it from shelf life', () => {
    const body = toCreateBody(ingredientId, { ...emptyFormValue(), quantity: 2, unit: 'each' });
    expect(body).toEqual({ ingredientId, quantity: 2, unit: 'each', location: 'pantry' });
    expect('expiresAt' in body).toBe(false);
  });

  it('sends null for an item with no expiry and a date when one is picked', () => {
    expect(toCreateBody(ingredientId, { ...emptyFormValue(), expiryMode: 'none' }).expiresAt).toBeNull();
    expect(
      toCreateBody(ingredientId, { ...emptyFormValue(), expiryMode: 'date', expiresAt: '2026-10-10' }).expiresAt,
    ).toBe('2026-10-10');
  });

  it('includes purchase date and trimmed notes only when filled in', () => {
    const body = toCreateBody(ingredientId, { ...emptyFormValue(), purchasedAt: '2026-10-01', notes: '  opened ' });
    expect(body.purchasedAt).toBe('2026-10-01');
    expect(body.notes).toBe('opened');
    expect('notes' in toCreateBody(ingredientId, { ...emptyFormValue(), notes: '   ' })).toBe(false);
  });
});

describe('toUpdateBody', () => {
  it('round-trips an item and clears blank notes and expiry explicitly', () => {
    const value = formValueFromItem(pantryItem({ notes: 'half used' }));
    expect(toUpdateBody(value)).toEqual({
      quantity: 6,
      unit: 'each',
      location: 'fridge',
      purchasedAt: '2026-09-27',
      expiresAt: '2026-10-04',
      notes: 'half used',
    });
    expect(toUpdateBody({ ...value, expiryMode: 'none', notes: ' ' })).toMatchObject({ expiresAt: null, notes: null });
  });
});
