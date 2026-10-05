import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { DocumentSummary } from '@stockpot/shared';
import { DocumentListPage } from './document-list-page';
import { summary } from './test-data';

describe('DocumentListPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(inputs: Record<string, string> = {}, items: DocumentSummary[] = []) {
    const fixture = TestBed.createComponent(DocumentListPage);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    TestBed.tick();
    const request = http.expectOne((req) => req.url === '/api/documents');
    request.flush({ items });
    await fixture.whenStable();
    return { request, element: fixture.nativeElement as HTMLElement };
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('lists documents with kind, chunk count, and embedding model', async () => {
    const { element } = await render({}, [
      summary(),
      summary({
        id: '00000000-0000-4000-8000-000000000102',
        kind: 'note',
        title: 'Braising notes',
        recipeSlug: null,
        embeddingModel: null,
        ingestedAt: null,
      }),
    ]);
    const rows = element.querySelectorAll('tr[mat-row]');
    expect(rows).toHaveLength(2);
    const cells = (row: Element | undefined) => [...(row?.querySelectorAll('td') ?? [])].map(text);
    expect(text(rows[0]?.querySelector('td a'))).toBe('Beef Pot Roast');
    expect(text(rows[0]?.querySelector('td .sub'))).toBe('1.5 KB');
    expect(cells(rows[0]).slice(1, 4)).toEqual(['Recipe', '3', 'nomic-embed-text']);
    expect(rows[0]?.querySelector('a')?.getAttribute('href')).toBe('/00000000-0000-4000-8000-000000000101');
    expect(cells(rows[1]).slice(1)).toEqual(['Note', '3', 'Not embedded', 'Not yet']);
  });

  it('sends a known kind filter from the URL and ignores unknown ones', async () => {
    const filtered = await render({ kind: 'technique' });
    expect(filtered.request.request.params.get('kind')).toBe('technique');

    const unknown = await render({ kind: 'video' });
    expect(unknown.request.request.params.has('kind')).toBe(false);
  });

  it('puts the kind filter in the URL', async () => {
    const { element } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    [...element.querySelectorAll<HTMLButtonElement>('mat-button-toggle button')]
      .find((b) => b.textContent?.includes('Notes'))!
      .click();
    expect(navigate).toHaveBeenCalledWith([], { queryParams: { kind: 'note' }, queryParamsHandling: 'merge' });
  });

  it('puts a submitted search in the URL', async () => {
    const { element } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    element.querySelector<HTMLInputElement>('input[name=q]')!.value = '  pot roast ';
    element.querySelector('form[role=search]')!.dispatchEvent(new Event('submit'));
    expect(navigate).toHaveBeenCalledWith([], { queryParams: { q: 'pot roast' }, queryParamsHandling: 'merge' });
  });

  it('explains how to add recipes when there are no documents', async () => {
    const { element } = await render();
    expect(text(element.querySelector('.message'))).toContain('npm run ingest:recipes');
  });
});
