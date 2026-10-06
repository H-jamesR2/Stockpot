import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SearchResult } from '@stockpot/shared';
import { DocumentSearch, SEARCH_LIMIT } from './document-search';

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    chunkId: '00000000-0000-4000-8000-000000000301',
    documentId: '00000000-0000-4000-8000-000000000101',
    documentTitle: 'Beef Pot Roast',
    documentKind: 'recipe',
    recipeSlug: 'beef-pot-roast',
    headings: ['Beef Pot Roast', 'Steps'],
    content: 'Beef Pot Roast > Steps\n\n1. Brown the roast.\n2. Cover and simmer for 2 hours.',
    score: 0.032787,
    vectorRank: 1,
    vectorDistance: 0.1219,
    textRank: 2,
    ...overrides,
  };
}

describe('DocumentSearch', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(inputs: { query?: string; kind?: 'recipe' | null }, results?: SearchResult[]) {
    const fixture = TestBed.createComponent(DocumentSearch);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    TestBed.tick();
    const request = results ? http.expectOne((req) => req.url === '/api/search') : undefined;
    request?.flush({ query: inputs.query, results });
    await fixture.whenStable();
    return { fixture, request, element: fixture.nativeElement as HTMLElement };
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('does not search until there is a query', async () => {
    await render({ query: '' });
    http.expectNone('/api/search');
  });

  it('searches with the query, limit, and kind filter', async () => {
    const { request } = await render({ query: 'pot roast', kind: 'recipe' }, []);
    expect(request!.request.params.get('q')).toBe('pot roast');
    expect(request!.request.params.get('limit')).toBe(String(SEARCH_LIMIT));
    expect(request!.request.params.get('kind')).toBe('recipe');
  });

  it('shows each result with a link to its chunk and why it matched', async () => {
    const { element } = await render({ query: 'pot roast' }, [result()]);
    const item = element.querySelector('.results li');
    const link = item?.querySelector('a');
    expect(text(link)).toBe('Beef Pot Roast > Steps');
    expect(link?.getAttribute('href')).toBe(
      '/documents/00000000-0000-4000-8000-000000000101#chunk-00000000-0000-4000-8000-000000000301',
    );
    expect(text(item?.querySelector('.snippet'))).toBe('1. Brown the roast. 2. Cover and simmer for 2 hours.');
    expect(text(item?.querySelector('.why'))).toBe('meaning #1 (distance 0.12) · keywords #2 · score 0.0328');
  });

  it('explains results found by only one retriever and shortens long snippets', async () => {
    const long = `Title\n\n${'word '.repeat(100)}`;
    const { element } = await render({ query: 'knife' }, [
      result({
        chunkId: '00000000-0000-4000-8000-000000000302',
        vectorRank: null,
        vectorDistance: null,
        content: long,
      }),
      result({ chunkId: '00000000-0000-4000-8000-000000000303', textRank: null }),
    ]);
    const [keywordOnly, meaningOnly] = element.querySelectorAll('.results li');
    expect(text(keywordOnly?.querySelector('.why'))).toContain('not in vector results · keywords #2');
    expect(text(keywordOnly?.querySelector('.snippet'))?.endsWith('…')).toBe(true);
    expect(text(meaningOnly?.querySelector('.why'))).toContain('no keyword match');
  });

  it('says so when nothing matched', async () => {
    const { element } = await render({ query: 'quantum' }, []);
    expect(text(element.querySelector('.message'))).toBe('No chunks matched "quantum".');
  });

  it('emits the typed query on submit', async () => {
    const { fixture, element } = await render({ query: '' });
    const emitted: string[] = [];
    fixture.componentInstance.queryChange.subscribe((q) => emitted.push(q));
    element.querySelector<HTMLInputElement>('input[name=q]')!.value = 'braise';
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(emitted).toEqual(['braise']);
  });
});
