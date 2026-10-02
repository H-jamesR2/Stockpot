import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import type { RecipeList } from '@stockpot/shared';
import { API_BASE_URL } from '../core/api-base-url';
import { formatMinutes } from './format-minutes';

export const PAGE_SIZE = 20;

type FilterName = 'q' | 'cuisine' | 'method';

/** Recipe browser. Every filter lives in the URL so views can be shared and the back button works. */
@Component({
  selector: 'sp-recipe-list-page',
  imports: [MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, RouterLink],
  templateUrl: './recipe-list-page.html',
  styleUrl: './recipe-list-page.scss',
})
export class RecipeListPage {
  // Bound from query parameters by withComponentInputBinding.
  readonly q = input<string>();
  readonly cuisine = input<string>();
  readonly method = input<string>();
  readonly offset = input<string>();

  private readonly router = inject(Router);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly formatMinutes = formatMinutes;
  protected readonly pageOffset = computed(() => Math.max(0, Math.trunc(Number(this.offset())) || 0));
  protected readonly activeFilters = computed(() =>
    (['cuisine', 'method'] as const).flatMap((name) => {
      const value = this[name]();
      return value ? [{ name, value }] : [];
    }),
  );

  protected readonly recipes = httpResource<RecipeList>(() => {
    const params: Record<string, string | number> = { limit: PAGE_SIZE, offset: this.pageOffset() };
    for (const name of ['q', 'cuisine', 'method'] as const) {
      const value = this[name]();
      if (value) params[name] = value;
    }
    return { url: `${this.apiBaseUrl}/recipes`, params };
  });

  protected readonly items = computed(() => (this.recipes.hasValue() ? this.recipes.value().items : []));
  protected readonly hasNextPage = computed(() => this.items().length === PAGE_SIZE);

  protected search(term: string): void {
    void this.navigate({ q: term.trim() || null, offset: null });
  }

  protected clear(name: FilterName): void {
    void this.navigate({ [name]: null, offset: null });
  }

  protected clearAll(): void {
    void this.navigate({ q: null, cuisine: null, method: null, offset: null });
  }

  protected page(direction: 1 | -1): void {
    const next = this.pageOffset() + direction * PAGE_SIZE;
    void this.navigate({ offset: next > 0 ? next : null });
  }

  private navigate(queryParams: Record<string, string | number | null>): Promise<boolean> {
    return this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
  }
}
