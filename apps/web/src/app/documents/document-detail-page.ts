import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import type { DocumentDetail } from '@stockpot/shared';
import { API_BASE_URL } from '../core/api-base-url';
import { ConfirmDialog, type ConfirmDialogData } from '../pantry/confirm-dialog';
import { chunkAnchor, formatBytes, KIND_LABELS } from './document-labels';

/** One document and the chunks it was split into, in order. Citations link here by chunk anchor. */
@Component({
  selector: 'sp-document-detail-page',
  imports: [DatePipe, MatButtonModule, MatProgressBarModule, RouterLink],
  templateUrl: './document-detail-page.html',
  styleUrl: './document-detail-page.scss',
})
export class DocumentDetailPage {
  /** Bound from the :id route parameter. */
  readonly id = input.required<string>();

  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly kindLabels = KIND_LABELS;
  protected readonly formatBytes = formatBytes;
  protected readonly chunkAnchor = chunkAnchor;

  protected readonly document = httpResource<DocumentDetail>(
    () => `${this.apiBaseUrl}/documents/${encodeURIComponent(this.id())}`,
  );
  protected readonly notFound = computed(() => {
    const error = this.document.error();
    return error instanceof HttpErrorResponse && (error.status === 404 || error.status === 400);
  });

  /** Recipe documents follow their recipe, so only uploads can be deleted here. */
  protected remove(doc: DocumentDetail): void {
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data: {
          title: `Delete ${doc.title}?`,
          message: 'This removes the file, its chunks, and its embeddings. Answers will no longer cite it.',
          confirmLabel: 'Delete',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.http.delete(`${this.apiBaseUrl}/documents/${doc.id}`).subscribe({
          next: () => {
            this.snackBar.open(`Deleted ${doc.title}`, undefined, { duration: 3000 });
            void this.router.navigate(['/documents']);
          },
          error: (error: unknown) => {
            const message =
              error instanceof HttpErrorResponse && error.status === 404
                ? 'Only the person who uploaded a document can delete it.'
                : `Could not delete ${doc.title}. Try again.`;
            this.snackBar.open(message, undefined, { duration: 5000 });
          },
        });
      });
  }

  /** The chunk text starts with its heading path, which the page already shows above it. */
  protected body(content: string): string {
    const blank = content.indexOf('\n\n');
    return blank === -1 ? content : content.slice(blank + 2);
  }
}
