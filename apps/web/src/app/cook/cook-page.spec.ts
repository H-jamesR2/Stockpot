import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { PantryMatch } from '@stockpot/shared';
import { CLOSE_COVERAGE, CookPage, DEFAULT_WINDOW, MATCH_LIMIT } from './cook-page';

function match(overrides: Partial<PantryMatch> = {}): PantryMatch {
  return {
    recipe: {
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'french-spinach-frittata',
      title: 'French Spinach Frittata',
      description: null,
      servings: 6,
      prepMin: null,
      cookMin: null,
      totalMin: null,
      cuisine: 'french',
      methods: ['bake'],
    },
    requiredCount: 4,
    haveCount: 3,
    coverage: 0.75,
    expiringCount: 2,
    expiring: [
      { name: 'spinach', expiresAt: '2026-10-03', daysUntilExpiry: 1 },
      { name: 'scallion', expiresAt: '2026-10-04', daysUntilExpiry: 2 },
    ],
    missing: ['feta'],
    assumedStaples: ['black pepper', 'kosher salt', 'neutral oil'],
    ...overrides,
  };
}

describe('CookPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(inputs: Record<string, string> = {}, items: PantryMatch[] = []) {
    const fixture = TestBed.createComponent(CookPage);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    TestBed.tick();
    const request = http.expectOne((req) => req.url === '/api/recipes/pantry-matches');
    request.flush({ items });
    await fixture.whenStable();
    return { request, element: fixture.nativeElement as HTMLElement };
  }

  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim();

  it('shows coverage, expiring use, what is missing, and what was assumed', async () => {
    const { element } = await render({}, [match()]);
    const card = element.querySelector('mat-card');

    expect(text(card?.querySelector('mat-card-title'))).toBe('French Spinach Frittata');
    expect(text(card?.querySelector('mat-card-subtitle'))).toBe('You have 3 of 4');
    expect(text(card?.querySelector('.expiring-heading'))).toBe('Uses 2 items expiring soon:');
    const expiring = [...(card?.querySelectorAll('.expiring li') ?? [])].map(text);
    expect(expiring).toEqual(['spinach Tomorrow (2026-10-03)', 'scallion In 2 days (2026-10-04)']);
    expect(card?.querySelector('.expiring li .expiry.soon')).not.toBeNull();
    expect(text(card?.querySelector('.missing'))).toBe('Missing: feta');
    expect(text(card?.querySelector('.assumed'))).toBe('Assumes black pepper, kosher salt, neutral oil');
  });

  it('leaves out the expiring note and says so when nothing is missing', async () => {
    const { element } = await render({}, [
      match({ expiringCount: 0, expiring: [], missing: [], haveCount: 4, coverage: 1 }),
    ]);
    expect(element.querySelector('.expiring-heading')).toBeNull();
    expect(element.querySelector('.expiring')).toBeNull();
    expect(text(element.querySelector('.missing'))).toBe('You have everything.');
  });

  it('asks for the default window and all coverage when the URL has no settings', async () => {
    const { request } = await render();
    const params = request.request.params;
    expect(params.get('expiringWithinDays')).toBe(String(DEFAULT_WINDOW));
    expect(params.get('minCoverage')).toBe('0');
    expect(params.get('limit')).toBe(String(MATCH_LIMIT));
  });

  it('uses the window and coverage filter from the URL, ignoring windows it does not offer', async () => {
    const chosen = await render({ expiringWithinDays: '7', minCoverage: String(CLOSE_COVERAGE) });
    expect(chosen.request.request.params.get('expiringWithinDays')).toBe('7');
    expect(chosen.request.request.params.get('minCoverage')).toBe(String(CLOSE_COVERAGE));

    const unknown = await render({ expiringWithinDays: '99' });
    expect(unknown.request.request.params.get('expiringWithinDays')).toBe(String(DEFAULT_WINDOW));
  });

  it('puts the coverage filter in the URL', async () => {
    const { element } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    element.querySelector<HTMLButtonElement>('mat-slide-toggle button')!.click();
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { minCoverage: CLOSE_COVERAGE },
      queryParamsHandling: 'merge',
    });
  });

  it('points to the pantry when there is nothing to suggest', async () => {
    const { element } = await render({}, []);
    expect(text(element.querySelector('.message'))).toContain('Add what you have to your pantry.');
    expect(element.querySelector('.message a')?.getAttribute('href')).toBe('/pantry');
  });
});
