import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import type { PantryItem, PantryList, PantryLocation } from '@stockpot/shared';
import { API_BASE_URL } from '../core/api-base-url';
import { ConfirmDialog, type ConfirmDialogData } from './confirm-dialog';
import { expiryLabel } from './expiry-label';
import { LOCATIONS, PantryItemDialog, type PantryItemDialogData } from './pantry-item-dialog';

/** Window for the "expiring soon" filter. */
export const EXPIRING_SOON_DAYS = 7;

@Component({
  selector: 'sp-pantry-page',
  imports: [MatButtonModule, MatButtonToggleModule, MatProgressBarModule, MatSlideToggleModule, MatTableModule],
  templateUrl: './pantry-page.html',
  styleUrl: './pantry-page.scss',
})
export class PantryPage {
  // Bound from query parameters by withComponentInputBinding.
  readonly location = input<string>();
  readonly expiringWithinDays = input<string>();

  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly locations = LOCATIONS;
  protected readonly expiringSoonDays = EXPIRING_SOON_DAYS;
  protected readonly expiryLabel = expiryLabel;
  protected readonly columns = ['ingredient', 'quantity', 'location', 'expires', 'actions'];

  protected readonly locationFilter = computed(() => {
    const value = this.location();
    return LOCATIONS.find((l) => l === value) ?? null;
  });
  protected readonly expiringFilter = computed(() => {
    const days = Number(this.expiringWithinDays());
    return Number.isInteger(days) && days >= 0 ? days : null;
  });
  protected readonly filtered = computed(() => this.locationFilter() !== null || this.expiringFilter() !== null);

  protected readonly pantry = httpResource<PantryList>(() => {
    const params: Record<string, string | number> = {};
    const location = this.locationFilter();
    const days = this.expiringFilter();
    if (location) params['location'] = location;
    if (days !== null) params['expiringWithinDays'] = days;
    return { url: `${this.apiBaseUrl}/pantry`, params };
  });
  protected readonly items = computed(() => (this.pantry.hasValue() ? this.pantry.value().items : []));

  protected setLocation(location: PantryLocation | 'all'): void {
    void this.navigate({ location: location === 'all' ? null : location });
  }

  protected setExpiringOnly(on: boolean): void {
    void this.navigate({ expiringWithinDays: on ? EXPIRING_SOON_DAYS : null });
  }

  protected add(): void {
    this.openItemDialog({ mode: 'add' }, 'Added');
  }

  protected edit(item: PantryItem): void {
    this.openItemDialog({ mode: 'edit', item }, 'Updated');
  }

  protected remove(item: PantryItem): void {
    const name = item.ingredient.canonicalName;
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data: { title: `Remove ${name}?`, message: 'This deletes it from your pantry.', confirmLabel: 'Remove' },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.http.delete(`${this.apiBaseUrl}/pantry/${item.id}`).subscribe({
          next: () => {
            this.pantry.reload();
            this.snackBar.open(`Removed ${name}`, undefined, { duration: 3000 });
          },
          error: () => this.snackBar.open(`Could not remove ${name}. Try again.`, undefined, { duration: 5000 }),
        });
      });
  }

  private openItemDialog(data: PantryItemDialogData, verb: string): void {
    this.dialog
      .open<PantryItemDialog, PantryItemDialogData, PantryItem>(PantryItemDialog, { data, width: '560px' })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.pantry.reload();
        this.snackBar.open(`${verb} ${saved.ingredient.canonicalName}`, undefined, { duration: 3000 });
      });
  }

  private navigate(queryParams: Record<string, string | number | null>): Promise<boolean> {
    return this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
  }
}
