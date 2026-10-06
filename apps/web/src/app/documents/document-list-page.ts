import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import type { DocumentKind, DocumentList, DocumentSummary } from '@stockpot/shared';
import { API_BASE_URL } from '../core/api-base-url';
import { formatBytes, KIND_LABELS } from './document-labels';
import { DocumentSearch } from './document-search';
import { UploadDocumentDialog } from './upload-document-dialog';

const KINDS: readonly DocumentKind[] = ['recipe', 'technique', 'note'];

/** Everything retrieval can draw on: recipes rendered as text, plus uploaded technique pages and notes. */
@Component({
  selector: 'sp-document-list-page',
  imports: [
    DatePipe,
    DocumentSearch,
    MatButtonModule,
    MatButtonToggleModule,
    MatProgressBarModule,
    MatTableModule,
    RouterLink,
  ],
  templateUrl: './document-list-page.html',
  styleUrl: './document-list-page.scss',
})
export class DocumentListPage {
  // Bound from the query string by withComponentInputBinding.
  readonly kind = input<string>();
  readonly q = input<string>();

  private readonly router = inject(Router);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly kinds = KINDS;
  protected readonly kindLabels = KIND_LABELS;
  protected readonly formatBytes = formatBytes;
  protected readonly columns = ['title', 'kind', 'chunks', 'model', 'ingested'];

  protected readonly kindFilter = computed(() => KINDS.find((k) => k === this.kind()) ?? null);
  protected readonly documents = httpResource<DocumentList>(() => {
    const kind = this.kindFilter();
    const params: Record<string, string> = kind ? { kind } : {};
    return { url: `${this.apiBaseUrl}/documents`, params };
  });
  protected readonly items = computed(() => (this.documents.hasValue() ? this.documents.value().items : []));

  /** mat-table rows are untyped in templates, so look labels up through a typed method. */
  protected kindLabel(kind: DocumentKind): string {
    return KIND_LABELS[kind];
  }

  protected openUpload(): void {
    this.dialog
      .open<UploadDocumentDialog, undefined, DocumentSummary>(UploadDocumentDialog, {
        width: '520px',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.documents.reload();
        this.snackBar.open(`Added ${created.title} in ${created.chunkCount} chunks`, undefined, { duration: 4000 });
      });
  }

  protected setQuery(q: string): void {
    void this.router.navigate([], { queryParams: { q: q.trim() || null }, queryParamsHandling: 'merge' });
  }

  protected setKind(kind: DocumentKind | 'all'): void {
    void this.router.navigate([], {
      queryParams: { kind: kind === 'all' ? null : kind },
      queryParamsHandling: 'merge',
    });
  }
}
