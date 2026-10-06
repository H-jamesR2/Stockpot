import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import type { DocumentKind, SearchResponse, SearchResult } from '@stockpot/shared';
import { API_BASE_URL } from '../core/api-base-url';
import { chunkAnchor, chunkBody, KIND_LABELS } from './document-labels';

const SNIPPET_CHARS = 280;
export const SEARCH_LIMIT = 10;

/**
 * Hybrid search over chunks, showing why each result matched. The parent page owns the query
 * so it can live in the URL.
 */
@Component({
  selector: 'sp-document-search',
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, RouterLink],
  templateUrl: './document-search.html',
  styleUrl: './document-search.scss',
})
export class DocumentSearch {
  readonly query = input<string>('');
  readonly kind = input<DocumentKind | null>(null);
  readonly queryChange = output<string>();

  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly kindLabels = KIND_LABELS;
  protected readonly chunkAnchor = chunkAnchor;

  protected readonly results = httpResource<SearchResponse>(() => {
    const q = this.query().trim();
    if (!q) return undefined;
    const kind = this.kind();
    const params: Record<string, string | number> = { q, limit: SEARCH_LIMIT };
    if (kind) params['kind'] = kind;
    return { url: `${this.apiBaseUrl}/search`, params };
  });
  protected readonly items = computed(() => (this.results.hasValue() ? this.results.value().results : []));

  protected snippet(result: SearchResult): string {
    const body = chunkBody(result.content).replace(/\s+/g, ' ').trim();
    return body.length <= SNIPPET_CHARS ? body : `${body.slice(0, SNIPPET_CHARS).trimEnd()}…`;
  }

  protected path(result: SearchResult): string {
    return result.headings.length > 0 ? result.headings.join(' > ') : result.documentTitle;
  }

  /** A one-line explanation of how each retriever ranked the chunk. */
  protected why(result: SearchResult): string {
    const parts = [
      result.vectorRank === null
        ? 'not in vector results'
        : `meaning #${result.vectorRank} (distance ${result.vectorDistance?.toFixed(2)})`,
      result.textRank === null ? 'no keyword match' : `keywords #${result.textRank}`,
      `score ${result.score.toFixed(4)}`,
    ];
    return parts.join(' · ');
  }
}
