import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DocumentDetailPage } from './document-detail-page';
import { detail } from './test-data';

describe('DocumentDetailPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(respond: (req: ReturnType<HttpTestingController['expectOne']>) => void) {
    const fixture = TestBed.createComponent(DocumentDetailPage);
    fixture.componentRef.setInput('id', 'doc-1');
    TestBed.tick();
    respond(http.expectOne('/api/documents/doc-1'));
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows each chunk under its heading path with an anchor citations can link to', async () => {
    const element = await render((req) => req.flush(detail()));
    expect(element.querySelector('h1')?.textContent).toBe('Beef Pot Roast');

    const chunks = element.querySelectorAll('.chunks li');
    expect([...chunks].map((c) => c.id)).toEqual(['chunk-0', 'chunk-1']);
    expect(chunks[1]?.querySelector('.path')?.textContent).toBe('Beef Pot Roast > Steps');
    // The heading path line is shown once, above the chunk, not repeated in the body.
    expect(chunks[1]?.querySelector('.content')?.textContent).toBe('1. Cover and simmer for 2 hours.');
    expect(chunks[0]?.querySelector('.path')?.textContent).toBe('Beef Pot Roast');
  });

  it('links recipe documents back to their recipe', async () => {
    const element = await render((req) => req.flush(detail()));
    const link = [...element.querySelectorAll('a')].find((a) => a.textContent?.includes('Open the recipe'));
    expect(link?.getAttribute('href')).toBe('/recipes/beef-pot-roast');
  });

  it('says so when the document does not exist', async () => {
    const element = await render((req) =>
      req.flush(
        { statusCode: 404, error: 'Not Found', message: 'Document not found' },
        { status: 404, statusText: 'Not Found' },
      ),
    );
    expect(element.textContent).toContain('That document does not exist.');
  });
});
