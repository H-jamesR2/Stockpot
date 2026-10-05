import { DatePipe } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import type { DocumentDetail } from '@stockpot/shared';
import { API_BASE_URL } from '../core/api-base-url';
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

  /** The chunk text starts with its heading path, which the page already shows above it. */
  protected body(content: string): string {
    const blank = content.indexOf('\n\n');
    return blank === -1 ? content : content.slice(blank + 2);
  }
}
