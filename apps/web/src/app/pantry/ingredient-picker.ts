import { httpResource } from '@angular/common/http';
import { Component, computed, inject, model } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { Ingredient, IngredientMatch, ResolveIngredientResponse } from '@stockpot/shared';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { API_BASE_URL } from '../core/api-base-url';

export const RESOLVE_DEBOUNCE_MS = 200;

/**
 * Free-text ingredient search backed by the resolver. The user always picks an option,
 * and when the resolver reports a tie ("pepper") nothing is preselected.
 */
@Component({
  selector: 'sp-ingredient-picker',
  imports: [MatAutocompleteModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  templateUrl: './ingredient-picker.html',
  styles: `
    :host {
      display: block;
    }
    mat-form-field {
      width: 100%;
    }
    .ambiguous {
      color: var(--mat-sys-tertiary);
    }
  `,
})
export class IngredientPicker {
  readonly ingredient = model<Ingredient | null>(null);

  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly text = new FormControl<string | IngredientMatch>('', { nonNullable: true });
  protected readonly query = toSignal(
    this.text.valueChanges.pipe(
      map((value) => (typeof value === 'string' ? value.trim() : '')),
      debounceTime(RESOLVE_DEBOUNCE_MS),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  protected readonly result = httpResource<ResolveIngredientResponse>(() => {
    const q = this.query();
    return q ? { url: `${this.apiBaseUrl}/ingredients/resolve`, params: { q } } : undefined;
  });
  protected readonly matches = computed(() => (this.result.hasValue() ? this.result.value().matches : []));
  protected readonly ambiguous = computed(() => this.result.hasValue() && this.result.value().ambiguous);

  constructor() {
    // Typing after a pick means the user is choosing again.
    this.text.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (typeof value === 'string' && this.ingredient()) this.ingredient.set(null);
    });
  }

  protected readonly displayWith = (value: string | IngredientMatch | null): string =>
    typeof value === 'string' ? value : (value?.ingredient.canonicalName ?? '');

  protected select(match: IngredientMatch): void {
    this.ingredient.set(match.ingredient);
  }
}
