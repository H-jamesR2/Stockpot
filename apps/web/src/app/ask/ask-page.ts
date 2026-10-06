import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import type { AskResult, AskSource } from '@stockpot/shared';
import { chunkAnchor } from '../documents/document-labels';
import { AskClient } from './ask-client';
import { splitCitations } from './citations';

type Status = 'idle' | 'retrieving' | 'writing' | 'done' | 'error' | 'stopped';

/**
 * Ask a question and watch the answer stream in. A local model on a CPU takes a minute or two,
 * so the page shows the sources and a running clock while it writes.
 */
@Component({
  selector: 'sp-ask-page',
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, RouterLink],
  templateUrl: './ask-page.html',
  styleUrl: './ask-page.scss',
})
export class AskPage {
  private readonly client = inject(AskClient);

  protected readonly status = signal<Status>('idle');
  protected readonly question = signal('');
  protected readonly sources = signal<AskSource[]>([]);
  protected readonly streamed = signal('');
  protected readonly result = signal<AskResult | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly elapsedSeconds = signal(0);

  protected readonly running = computed(() => this.status() === 'retrieving' || this.status() === 'writing');
  protected readonly answerParts = computed(() => splitCitations(this.result()?.answer ?? ''));
  protected readonly chunkAnchor = chunkAnchor;

  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected source(n: number): AskSource | undefined {
    return this.sources().find((s) => s.n === n);
  }

  protected path(source: AskSource): string {
    return source.headings.length > 0 ? source.headings.join(' > ') : source.documentTitle;
  }

  protected async ask(text: string): Promise<void> {
    const question = text.trim();
    if (!question || this.running()) return;

    this.question.set(question);
    this.sources.set([]);
    this.streamed.set('');
    this.result.set(null);
    this.error.set(null);
    this.status.set('retrieving');
    this.startClock();
    this.controller = new AbortController();

    try {
      for await (const event of this.client.stream({ question }, this.controller.signal)) {
        switch (event.type) {
          case 'sources':
            this.sources.set(event.sources);
            if (event.sources.length > 0) this.status.set('writing');
            break;
          case 'token':
            this.streamed.update((text) => text + event.text);
            break;
          case 'done':
            this.result.set(event.result);
            this.status.set('done');
            break;
          case 'error':
            this.error.set(event.message);
            this.status.set('error');
            break;
        }
      }
    } catch (error) {
      if (this.controller.signal.aborted) {
        this.status.set('stopped');
      } else {
        this.error.set(error instanceof Error ? error.message : 'Could not reach the server.');
        this.status.set('error');
      }
    } finally {
      this.stopClock();
      this.controller = null;
    }
  }

  protected stop(): void {
    this.controller?.abort();
    this.stopClock();
  }

  private startClock(): void {
    this.stopClock();
    const started = Date.now();
    this.elapsedSeconds.set(0);
    this.timer = setInterval(() => this.elapsedSeconds.set(Math.floor((Date.now() - started) / 1000)), 1000);
  }

  private stopClock(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
