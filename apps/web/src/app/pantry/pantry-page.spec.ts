import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter, Router } from '@angular/router';
import type { PantryItem } from '@stockpot/shared';
import { EXPIRING_SOON_DAYS, PantryPage } from './pantry-page';
import { pantryItem } from './test-data';

describe('PantryPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function settle(fixture: ComponentFixture<PantryPage>) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  async function render(inputs: Record<string, string> = {}, items: PantryItem[] = []) {
    const fixture = TestBed.createComponent(PantryPage);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    TestBed.tick();
    const request = http.expectOne((req) => req.url === '/api/pantry');
    request.flush({ items });
    await settle(fixture);
    return { fixture, request, element: fixture.nativeElement as HTMLElement };
  }

  it('lists items with amount, location, and an expiry label', async () => {
    const { element } = await render({}, [
      pantryItem(),
      pantryItem({
        id: '00000000-0000-4000-8000-0000000000bb',
        expiresAt: null,
        daysUntilExpiry: null,
        location: 'pantry',
      }),
    ]);
    const rows = element.querySelectorAll('tr[mat-row]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('6 each');
    expect(rows[0]?.querySelector('.expiry.soon')?.textContent).toContain('In 2 days');
    expect(rows[1]?.querySelector('.expiry.none')?.textContent).toContain('No expiry');
  });

  it('sends location and expiry filters from the URL to the API', async () => {
    const { request } = await render({ location: 'fridge', expiringWithinDays: String(EXPIRING_SOON_DAYS) });
    expect(request.request.params.get('location')).toBe('fridge');
    expect(request.request.params.get('expiringWithinDays')).toBe(String(EXPIRING_SOON_DAYS));
  });

  it('ignores a location the API does not know', async () => {
    const { request } = await render({ location: 'garage' });
    expect(request.request.params.has('location')).toBe(false);
  });

  it('puts the expiring filter in the URL', async () => {
    const { element } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    element.querySelector<HTMLButtonElement>('mat-slide-toggle button')!.click();
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { expiringWithinDays: EXPIRING_SOON_DAYS },
      queryParamsHandling: 'merge',
    });
  });

  it('removes an item only after the user confirms', async () => {
    const item = pantryItem();
    const { fixture, element } = await render({}, [item]);

    element.querySelector<HTMLButtonElement>('button[aria-label="Remove scallion"]')!.click();
    await settle(fixture);
    http.expectNone({ method: 'DELETE' });

    // whenStable would wait on these open requests, so step one macrotask at a time instead.
    document.querySelector<HTMLButtonElement>('sp-confirm-dialog button.confirm')!.click();
    await new Promise((resolve) => setTimeout(resolve));

    http.expectOne({ method: 'DELETE', url: `/api/pantry/${item.id}` }).flush(null, { status: 204, statusText: '' });
    TestBed.tick();
    http.expectOne((req) => req.url === '/api/pantry').flush({ items: [] });
    await settle(fixture);
    expect(element.textContent).toContain('Your pantry is empty.');
  });
});
