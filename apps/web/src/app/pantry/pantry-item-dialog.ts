import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import type { Ingredient, PantryItem, PantryLocation, Unit, UnitList } from '@stockpot/shared';
import { API_BASE_URL } from '../core/api-base-url';
import { IngredientPicker } from './ingredient-picker';
import { emptyFormValue, formValueFromItem, toCreateBody, toUpdateBody } from './pantry-item-form';

export type PantryItemDialogData = { mode: 'add' } | { mode: 'edit'; item: PantryItem };

export const LOCATIONS: readonly PantryLocation[] = ['fridge', 'freezer', 'pantry'];

/** Adds or edits one pantry item. Saves on its own and closes with the saved item. */
@Component({
  selector: 'sp-pantry-item-dialog',
  imports: [
    IngredientPicker,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  templateUrl: './pantry-item-dialog.html',
  styleUrl: './pantry-item-dialog.scss',
})
export class PantryItemDialog {
  protected readonly data = inject<PantryItemDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<PantryItemDialog, PantryItem>>(MatDialogRef);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly locations = LOCATIONS;
  protected readonly ingredient = signal<Ingredient | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly initial = this.data.mode === 'edit' ? formValueFromItem(this.data.item) : emptyFormValue();
  protected readonly form = this.fb.group({
    quantity: this.fb.control<number | null>(this.initial.quantity, [Validators.required, Validators.min(0.001)]),
    unit: [this.initial.unit, Validators.required],
    location: [this.initial.location],
    purchasedAt: [this.initial.purchasedAt],
    expiryMode: [this.initial.expiryMode],
    expiresAt: [this.initial.expiresAt, this.initial.expiryMode === 'date' ? Validators.required : []],
    notes: [this.initial.notes, Validators.maxLength(500)],
  });
  protected readonly expiryMode = toSignal(this.form.controls.expiryMode.valueChanges, {
    initialValue: this.initial.expiryMode,
  });

  protected readonly title =
    this.data.mode === 'edit' ? `Edit ${this.data.item.ingredient.canonicalName}` : 'Add to pantry';

  protected readonly units = httpResource<UnitList>(() => `${this.apiBaseUrl}/units`);
  protected readonly unitGroups = computed(() => {
    const groups = new Map<string, Unit[]>();
    for (const unit of this.units.hasValue() ? this.units.value().items : []) {
      groups.set(unit.kind, [...(groups.get(unit.kind) ?? []), unit]);
    }
    return [...groups].map(([kind, units]) => ({ kind, units }));
  });

  protected readonly shelfLifeHint = computed(() => {
    const days = this.ingredient()?.shelfLifeDays;
    if (days === undefined) return null;
    return days === null ? 'No shelf life on file, so it will have no expiry.' : `About ${days} days after purchase.`;
  });

  protected readonly canSave = computed(() => !this.saving() && (this.data.mode === 'edit' || !!this.ingredient()));

  constructor() {
    effect(() => {
      const ingredient = this.ingredient();
      if (ingredient) this.form.controls.unit.setValue(ingredient.defaultUnit);
    });

    this.form.controls.expiryMode.valueChanges.pipe(takeUntilDestroyed()).subscribe((mode) => {
      const expiresAt = this.form.controls.expiresAt;
      expiresAt.setValidators(mode === 'date' ? Validators.required : null);
      expiresAt.updateValueAndValidity();
    });
  }

  protected save(): void {
    if (this.form.invalid || !this.canSave()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);

    const value = this.form.getRawValue();
    const ingredient = this.ingredient();
    const request =
      this.data.mode === 'edit'
        ? this.http.patch<PantryItem>(`${this.apiBaseUrl}/pantry/${this.data.item.id}`, toUpdateBody(value))
        : this.http.post<PantryItem>(`${this.apiBaseUrl}/pantry`, toCreateBody(ingredient!.id, value));

    request.subscribe({
      next: (item) => this.dialogRef.close(item),
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(errorMessage(error));
      },
    });
  }
}

function errorMessage(error: unknown): string {
  const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
  if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
    return body.message;
  }
  return 'Could not save. Try again.';
}
