import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import type { PantryMatches } from '@stockpot/shared';
import { API_BASE_URL } from '../core/api-base-url';
import { expiryLabel } from '../pantry/expiry-label';

/** Expiry windows offered in the UI, in days. The API accepts 0 to 30. */
export const WINDOWS = [0, 3, 7] as const;
export const DEFAULT_WINDOW = 3;
/** "Hide recipes I'm far from making" keeps recipes where you have at least this share. */
export const CLOSE_COVERAGE = 0.5;
export const MATCH_LIMIT = 20;

/** Recipes ranked by how many soon-to-expire pantry items they use, then by how much you already have. */
@Component({
  selector: 'sp-cook-page',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    RouterLink,
  ],
  templateUrl: './cook-page.html',
  styleUrl: './cook-page.scss',
})
export class CookPage {
  // Bound from query parameters by withComponentInputBinding.
  readonly expiringWithinDays = input<string>();
  readonly minCoverage = input<string>();

  private readonly router = inject(Router);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly windows = WINDOWS;
  protected readonly expiryLabel = expiryLabel;
  protected readonly window = computed(() => {
    const days = Number(this.expiringWithinDays());
    return WINDOWS.find((w) => w === days) ?? DEFAULT_WINDOW;
  });
  protected readonly closeOnly = computed(() => Number(this.minCoverage()) === CLOSE_COVERAGE);

  protected readonly matches = httpResource<PantryMatches>(() => ({
    url: `${this.apiBaseUrl}/recipes/pantry-matches`,
    params: {
      expiringWithinDays: this.window(),
      minCoverage: this.closeOnly() ? CLOSE_COVERAGE : 0,
      limit: MATCH_LIMIT,
    },
  }));
  protected readonly items = computed(() => (this.matches.hasValue() ? this.matches.value().items : []));

  protected setWindow(days: number): void {
    void this.navigate({ expiringWithinDays: days === DEFAULT_WINDOW ? null : days });
  }

  protected setCloseOnly(on: boolean): void {
    void this.navigate({ minCoverage: on ? CLOSE_COVERAGE : null });
  }

  protected windowLabel(days: number): string {
    return days === 0 ? 'Today' : `${days} days`;
  }

  private navigate(queryParams: Record<string, number | null>): Promise<boolean> {
    return this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
  }
}
