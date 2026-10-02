import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { IngredientPicker } from './ingredient-picker';
import { PantryItemDialog, type PantryItemDialogData } from './pantry-item-dialog';
import { pantryItem, scallion } from './test-data';

const units = {
  items: [
    { code: 'g', name: 'gram', kind: 'mass' },
    { code: 'each', name: 'each', kind: 'count' },
  ],
};

describe('PantryItemDialog', () => {
  let http: HttpTestingController;
  let close: ReturnType<typeof vi.fn>;

  async function open(data: PantryItemDialogData) {
    close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PantryItemDialog);
    TestBed.tick();
    http.expectOne('/api/units').flush(units);
    await fixture.whenStable();
    return fixture;
  }

  function save(fixture: ComponentFixture<PantryItemDialog>) {
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  afterEach(() => http.verify());

  it('fills the default unit from the picked ingredient and creates the item', async () => {
    const fixture = await open({ mode: 'add' });
    const picker = fixture.debugElement.query(By.directive(IngredientPicker)).componentInstance as IngredientPicker;
    picker.ingredient.set(scallion);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('About 7 days after purchase.');
    save(fixture);

    const request = http.expectOne({ method: 'POST', url: '/api/pantry' });
    expect(request.request.body).toEqual({ ingredientId: scallion.id, quantity: 1, unit: 'each', location: 'pantry' });
    const created = pantryItem();
    request.flush(created);
    expect(close).toHaveBeenCalledWith(created);
  });

  it('does not save until an ingredient is picked', async () => {
    const fixture = await open({ mode: 'add' });
    const submit = (fixture.nativeElement as HTMLElement).ownerDocument.querySelector<HTMLButtonElement>(
      'button[form=pantry-item-form]',
    );
    expect(submit?.disabled).toBe(true);
    save(fixture);
    http.expectNone('/api/pantry');
  });

  it('patches an existing item and shows the server message on failure', async () => {
    const fixture = await open({ mode: 'edit', item: pantryItem() });
    save(fixture);

    const request = http.expectOne({ method: 'PATCH', url: `/api/pantry/${pantryItem().id}` });
    expect(request.request.body).toMatchObject({ quantity: 6, unit: 'each', expiresAt: '2026-10-04' });
    request.flush(
      { statusCode: 400, error: 'Bad Request', message: 'Values violate a data rule' },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role=alert]')?.textContent).toContain(
      'Values violate a data rule',
    );
    expect(close).not.toHaveBeenCalled();
  });
});
