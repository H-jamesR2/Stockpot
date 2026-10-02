import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { IngredientPicker, RESOLVE_DEBOUNCE_MS } from './ingredient-picker';
import { bellPepper, blackPepper, match, scallion } from './test-data';

describe('IngredientPicker', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function search(text: string, response: object) {
    const fixture = TestBed.createComponent(IngredientPicker);
    const autocomplete = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatAutocompleteHarness);
    await autocomplete.enterText(text);
    await new Promise((resolve) => setTimeout(resolve, RESOLVE_DEBOUNCE_MS + 50));
    TestBed.tick();
    const request = http.expectOne((req) => req.url === '/api/ingredients/resolve');
    expect(request.request.params.get('q')).toBe(text.trim());
    request.flush({ query: text.trim(), ...response });
    await fixture.whenStable();
    // Once the options render, the autocomplete trigger shows its panel on a delay(0), one macrotask later.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    return { fixture, autocomplete, element: fixture.nativeElement as HTMLElement };
  }

  it('lets the user pick a resolved ingredient', async () => {
    const { fixture, autocomplete } = await search('green onions', {
      ambiguous: false,
      matches: [match(scallion, 'green onion')],
    });

    const options = await autocomplete.getOptions();
    expect(await options[0]?.getText()).toContain('scallion (matched "green onion")');
    await autocomplete.selectOption({ text: /scallion/ });

    expect(fixture.componentInstance.ingredient()).toEqual(scallion);
    expect(await autocomplete.getValue()).toBe('scallion');
  });

  it('asks the user to choose instead of preselecting when the term is ambiguous', async () => {
    const { fixture, autocomplete, element } = await search('pepper', {
      ambiguous: true,
      matches: [match(blackPepper, 'pepper', true), match(bellPepper, 'pepper', true)],
    });

    expect(element.textContent).toContain('"pepper" could mean more than one ingredient. Pick one.');
    expect(await autocomplete.getOptions()).toHaveLength(2);
    expect(await autocomplete.getOptions({ isSelected: true })).toHaveLength(0);
    expect(fixture.componentInstance.ingredient()).toBeNull();
  });

  it('clears the pick when the user types again', async () => {
    const { fixture, autocomplete } = await search('green onions', {
      ambiguous: false,
      matches: [match(scallion, 'green onion')],
    });
    await autocomplete.selectOption({ text: /scallion/ });

    await autocomplete.enterText('x');
    expect(fixture.componentInstance.ingredient()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, RESOLVE_DEBOUNCE_MS + 50));
    TestBed.tick();
    http
      .expectOne((req) => req.url === '/api/ingredients/resolve')
      .flush({ query: 'x', ambiguous: false, matches: [] });
  });
});
