import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import type { RecipeDetail } from '@stockpot/shared';
import { API_BASE_URL } from '../core/api-base-url';
import { formatMinutes } from './format-minutes';

@Component({
  selector: 'sp-recipe-detail-page',
  imports: [MatButtonModule, MatProgressBarModule, RouterLink],
  templateUrl: './recipe-detail-page.html',
  styleUrl: './recipe-detail-page.scss',
})
export class RecipeDetailPage {
  /** Bound from the :slug route parameter. */
  readonly slug = input.required<string>();

  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly formatMinutes = formatMinutes;
  protected readonly recipe = httpResource<RecipeDetail>(
    () => `${this.apiBaseUrl}/recipes/${encodeURIComponent(this.slug())}`,
  );
  protected readonly notFound = computed(() => {
    const error = this.recipe.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });
}
