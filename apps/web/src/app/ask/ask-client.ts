import { inject, Injectable } from '@angular/core';
import type { AskEvent, AskRequest } from '@stockpot/shared';
import { API_BASE_URL } from '../core/api-base-url';
import { FETCH } from '../core/fetch';

export class AskError extends Error {}

/** Parses one Server-Sent Events block ("event: x\ndata: {...}"). */
function parseBlock(block: string): AskEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n');
  return data ? (JSON.parse(data) as AskEvent) : null;
}

/**
 * Posts a question to /ask and yields its events as they stream in. EventSource only does GET,
 * so this reads the response body directly.
 */
@Injectable({ providedIn: 'root' })
export class AskClient {
  private readonly fetch = inject(FETCH);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  async *stream(request: AskRequest, signal?: AbortSignal): AsyncGenerator<AskEvent> {
    const response = await this.fetch(`${this.apiBaseUrl}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      throw new AskError(typeof body?.message === 'string' ? body.message : `The server answered ${response.status}.`);
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffered = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += value;
      const blocks = buffered.split('\n\n');
      buffered = blocks.pop() ?? '';
      for (const block of blocks) {
        const event = parseBlock(block);
        if (event) yield event;
      }
    }
    const last = parseBlock(buffered);
    if (last) yield last;
  }
}
