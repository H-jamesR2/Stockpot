import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { RecipeSummary } from '@stockpot/shared';
import { PAGE_SIZE, RecipeListPage } from './recipe-list-page';

function summary(overrides: Partial<RecipeSummary>): RecipeSummary {
  return {
    id: crypto.randomUUID(),
    slug: 'red-wine-braised-chuck',
    title: 'Red Wine Braised Chuck',
    description: null,
    servings: 4,
    prepMin: 20,
    cookMin: 180,
    totalMin: 200,
    cuisine: 'french',
    methods: ['sear', 'braise'],
    ...overrides,
  };
}

describe('RecipeListPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(inputs: Record<string, string> = {}, items: RecipeSummary[] = []) {
    const fixture = TestBed.createComponent(RecipeListPage);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    TestBed.tick();
    const request = http.expectOne((req) => req.url === '/api/recipes');
    request.flush({ items });
    await fixture.whenStable();
    return { fixture, request, element: fixture.nativeElement as HTMLElement };
  }

  it('lists recipes with servings and total time', async () => {
    const { element } = await render({}, [summary({})]);
    expect(element.querySelector('mat-card-title')?.textContent).toContain('Red Wine Braised Chuck');
    // Browsers collapse template whitespace, so compare the text the way it renders.
    const subtitle = element.querySelector('mat-card-subtitle')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(subtitle).toBe('4 servings · 3 h 20 min');
  });

  it('sends filters from the URL to the API', async () => {
    const { request } = await render({ q: 'chuck', cuisine: 'french', method: 'braise', offset: '20' });
    const params = request.request.params;
    expect(params.get('q')).toBe('chuck');
    expect(params.get('cuisine')).toBe('french');
    expect(params.get('method')).toBe('braise');
    expect(params.get('offset')).toBe('20');
    expect(params.get('limit')).toBe(String(PAGE_SIZE));
  });

  it('leaves out filters that are not set', async () => {
    const { request } = await render();
    expect(request.request.params.keys().sort()).toEqual(['limit', 'offset']);
  });

  it('puts a submitted search in the URL and resets paging', async () => {
    const { element } = await render({ offset: '20' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    element.querySelector<HTMLInputElement>('input[name=q]')!.value = '  fried rice ';
    element.querySelector<HTMLButtonElement>('form button[type=submit]')!.click();

    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { q: 'fried rice', offset: null },
      queryParamsHandling: 'merge',
    });
  });

  it('shows active filters and an empty state when nothing matches', async () => {
    const { element } = await render({ cuisine: 'thai' }, []);
    expect(element.querySelector('.filters')?.textContent).toContain('cuisine: thai');
    expect(element.textContent).toContain('No recipes match these filters.');
  });

  it('offers a next page only when the page is full', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => summary({ slug: `recipe-${i}` }));
    const { element } = await render({}, full);
    const [previous, next] = element.querySelectorAll<HTMLButtonElement>('.pager button');
    expect(previous?.disabled).toBe(true);
    expect(next?.disabled).toBe(false);
  });
});
