import { TestBed } from '@angular/core/testing';
import type { AskEvent } from '@stockpot/shared';
import { FETCH } from '../core/fetch';
import { AskClient, AskError } from './ask-client';

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status, headers: { 'content-type': 'text/event-stream' } },
  );
}

const block = (event: AskEvent) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

describe('AskClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: FETCH, useValue: fetchMock }] });
  });

  async function collect(question = 'how long?', signal?: AbortSignal): Promise<AskEvent[]> {
    const events: AskEvent[] = [];
    for await (const event of TestBed.inject(AskClient).stream({ question }, signal)) events.push(event);
    return events;
  }

  it('posts the question and yields events, even when a block is split across chunks', async () => {
    const sources: AskEvent = { type: 'sources', sources: [] };
    const token: AskEvent = { type: 'token', text: 'Simmer ' };
    const whole = block(sources) + block(token);
    fetchMock.mockResolvedValue(sseResponse([whole.slice(0, 25), whole.slice(25, 70), whole.slice(70)]));

    expect(await collect()).toEqual([sources, token]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ask');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ question: 'how long?' });
  });

  it('passes the abort signal to fetch', async () => {
    fetchMock.mockResolvedValue(sseResponse([]));
    const controller = new AbortController();
    await collect('q', controller.signal);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].signal).toBe(controller.signal);
  });

  it('throws the server message when the request is rejected before streaming', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 400, error: 'Bad Request', message: '/question Too small' }), {
        status: 400,
      }),
    );
    await expect(collect('')).rejects.toEqual(new AskError('/question Too small'));
  });
});
