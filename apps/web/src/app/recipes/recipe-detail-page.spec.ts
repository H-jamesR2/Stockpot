import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { RecipeDetail } from '@stockpot/shared';
import { RecipeDetailPage } from './recipe-detail-page';

const chuck: RecipeDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'red-wine-braised-chuck',
  title: 'Red Wine Braised Chuck',
  description: 'Low and slow chuck roast with onion and carrot.',
  servings: 4,
  prepMin: 20,
  cookMin: 180,
  totalMin: 200,
  cuisine: 'french',
  methods: ['sear', 'braise'],
  source: null,
  sourceUrl: null,
  ingredients: [
    {
      position: 1,
      ingredient: {
        id: '00000000-0000-4000-8000-000000000002',
        slug: 'chuck-roast',
        canonicalName: 'chuck roast',
        category: 'protein',
      },
      quantity: 3,
      unit: 'lb',
      preparation: 'cut into 3 pieces',
      rawText: '3 lb beef chuck, cut into 3 pieces',
      isOptional: false,
    },
    {
      position: 2,
      ingredient: null,
      quantity: 1,
      unit: 'cup',
      preparation: null,
      rawText: '1 cup dry red wine',
      isOptional: false,
    },
  ],
  steps: [
    { stepNumber: 1, text: 'Season and sear the chuck on all sides, then remove.' },
    { stepNumber: 2, text: 'Deglaze with wine, return the beef, cover, and braise.' },
  ],
};

describe('RecipeDetailPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(respond: (request: ReturnType<HttpTestingController['expectOne']>) => void) {
    const fixture = TestBed.createComponent(RecipeDetailPage);
    fixture.componentRef.setInput('slug', 'red-wine-braised-chuck');
    TestBed.tick();
    respond(http.expectOne('/api/recipes/red-wine-braised-chuck'));
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows ingredients, steps, and times', async () => {
    const element = await render((request) => request.flush(chuck));
    expect(element.querySelector('h1')?.textContent).toContain('Red Wine Braised Chuck');
    expect(element.querySelectorAll('.ingredients li')).toHaveLength(2);
    expect(element.querySelectorAll('.steps li')).toHaveLength(2);
    expect(element.querySelector('.facts')?.textContent).toContain('3 h 20 min');
  });

  it('flags ingredient lines that did not resolve to an ingredient', async () => {
    const element = await render((request) => request.flush(chuck));
    const [resolved, unresolved] = element.querySelectorAll('.ingredients li');
    expect(resolved?.querySelector('.flag.warn')).toBeNull();
    expect(unresolved?.querySelector('.flag.warn')?.textContent).toContain('unmatched');
  });

  it('says so when the recipe does not exist', async () => {
    const element = await render((request) =>
      request.flush(
        { statusCode: 404, error: 'Not Found', message: 'Recipe not found' },
        { status: 404, statusText: 'Not Found' },
      ),
    );
    expect(element.textContent).toContain('That recipe does not exist.');
    expect(element.querySelector('h1')).toBeNull();
  });
});
