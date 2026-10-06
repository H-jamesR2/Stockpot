import { describe, expect, it } from 'vitest';
import { LlmError } from '../src/llm/index.js';
import { OllamaProvider } from '../src/llm/ollama-provider.js';

interface Call {
  url: string;
  body: Record<string, unknown>;
}

/** A stand-in for fetch that records requests and replies with a canned response. */
function fakeFetch(reply: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) as Record<string, unknown> });
    return reply();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function provider(fetchImpl: typeof fetch, embeddingModel = 'nomic-embed-text') {
  return new OllamaProvider({
    baseUrl: 'http://ollama.test:11434/',
    embeddingModel,
    chatModel: 'qwen2.5:3b',
    timeoutMs: 5_000,
    fetch: fetchImpl,
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('OllamaProvider', () => {
  it('embeds with the nomic task prefix for documents and queries', async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ embeddings: [[0.1, 0.2]] }));
    const llm = provider(fetchImpl);

    await llm.embed(['Braise low and slow.'], 'document');
    await llm.embed(['how long to braise chuck'], 'query');

    expect(calls[0]).toEqual({
      url: 'http://ollama.test:11434/api/embed',
      body: { model: 'nomic-embed-text', input: ['search_document: Braise low and slow.'] },
    });
    expect(calls[1]?.body.input).toEqual(['search_query: how long to braise chuck']);
  });

  it('leaves text alone for models that take no prefix', async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ embeddings: [[1]] }));
    await provider(fetchImpl, 'mxbai-embed-large').embed(['plain'], 'document');
    expect(calls[0]?.body.input).toEqual(['plain']);
  });

  it('skips the request when there is nothing to embed', async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ embeddings: [] }));
    expect(await provider(fetchImpl).embed([], 'document')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('rejects a response with the wrong number of embeddings', async () => {
    const { fetchImpl } = fakeFetch(() => json({ embeddings: [[1]] }));
    await expect(provider(fetchImpl).embed(['a', 'b'], 'document')).rejects.toThrow(
      'Ollama returned 1 embeddings for 2 inputs',
    );
  });

  it('chats without streaming at temperature 0 by default and returns the reply text', async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ message: { role: 'assistant', content: 'Ready.' } }));
    const reply = await provider(fetchImpl).chat([{ role: 'user', content: 'Say ready.' }]);

    expect(reply).toBe('Ready.');
    expect(calls[0]).toEqual({
      url: 'http://ollama.test:11434/api/chat',
      body: {
        model: 'qwen2.5:3b',
        messages: [{ role: 'user', content: 'Say ready.' }],
        stream: false,
        options: { temperature: 0 },
      },
    });
  });

  it('reports HTTP errors with the status and Ollama message', async () => {
    const { fetchImpl } = fakeFetch(() => json({ error: 'model "qwen2.5:3b" not found' }, 404));
    const failure = provider(fetchImpl).chat([{ role: 'user', content: 'hi' }]);
    await expect(failure).rejects.toBeInstanceOf(LlmError);
    await expect(failure).rejects.toThrow(/\/api\/chat failed with 404: .*not found/);
  });

  it('says Ollama is unreachable when the connection fails', async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(provider(fetchImpl).embed(['x'], 'query')).rejects.toThrow(
      'Could not reach Ollama at http://ollama.test:11434. Is it running?',
    );
  });
});

describe('OllamaProvider.chatStream', () => {
  function streamOf(chunks: string[]): Response {
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'application/x-ndjson' } },
    );
  }

  async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
    const pieces: string[] = [];
    for await (const piece of iterable) pieces.push(piece);
    return pieces;
  }

  it('streams message pieces, including lines split across network chunks', async () => {
    const { calls, fetchImpl } = fakeFetch(() =>
      streamOf([
        '{"message":{"content":"Braise "},"done":false}\n{"message":{"content":"low',
        ' and "},"done":false}\n',
        '{"message":{"content":"slow."},"done":false}\n{"message":{"content":""},"done":true}',
      ]),
    );
    const pieces = await collect(provider(fetchImpl).chatStream([{ role: 'user', content: 'How?' }]));

    expect(pieces).toEqual(['Braise ', 'low and ', 'slow.']);
    expect(calls[0]?.body).toMatchObject({ stream: true, options: { temperature: 0 } });
  });

  it('surfaces an error Ollama reports mid-stream', async () => {
    const { fetchImpl } = fakeFetch(() =>
      streamOf(['{"message":{"content":"Brai"},"done":false}\n{"error":"model ran out of memory"}\n']),
    );
    await expect(collect(provider(fetchImpl).chatStream([{ role: 'user', content: 'x' }]))).rejects.toThrow(
      'Ollama stopped mid-answer: model ran out of memory',
    );
  });

  it('passes the caller abort signal to the request', async () => {
    let seen: AbortSignal | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen = init.signal ?? undefined;
      return streamOf(['{"message":{"content":"ok"},"done":true}\n']);
    }) as typeof fetch;
    const controller = new AbortController();
    await collect(provider(fetchImpl).chatStream([{ role: 'user', content: 'x' }], { signal: controller.signal }));
    controller.abort();
    expect(seen?.aborted).toBe(true);
  });
});

describe('OllamaProvider timeouts', () => {
  const encoder = new TextEncoder();
  const line = (content: string) => encoder.encode(`${JSON.stringify({ message: { content }, done: false })}\n`);

  /** A fetch whose response body sends each piece after the given delay, honoring abort like real fetch. */
  function slowFetch(pieces: { afterMs: number; content: string }[], headersAfterMs = 0) {
    return (async (_url: string, init: RequestInit) => {
      const signal = init.signal!;
      const wait = (ms: number) =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, ms);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
          });
        });
      await wait(headersAfterMs);
      return new Response(
        new ReadableStream({
          async start(controller) {
            try {
              for (const piece of pieces) {
                await wait(piece.afterMs);
                controller.enqueue(line(piece.content));
              }
              controller.close();
            } catch (error) {
              controller.error(error);
            }
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
  }

  function provider(fetchImpl: typeof fetch, timeoutMs: number) {
    return new OllamaProvider({
      baseUrl: 'http://ollama.test:11434',
      embeddingModel: 'nomic-embed-text',
      chatModel: 'qwen2.5:3b',
      timeoutMs,
      fetch: fetchImpl,
    });
  }

  async function collect(iterable: AsyncIterable<string>): Promise<string> {
    let text = '';
    for await (const piece of iterable) text += piece;
    return text;
  }

  it('reports silence as a timeout, not as an unreachable server', async () => {
    const llm = provider(slowFetch([], 10_000), 50);
    await expect(collect(llm.chatStream([{ role: 'user', content: 'x' }]))).rejects.toThrow(
      'Ollama did not respond within 0 s',
    );
  });

  it('keeps streaming past the timeout as long as pieces keep arriving', async () => {
    const pieces = Array.from({ length: 6 }, (_, i) => ({ afterMs: 40, content: `p${i} ` }));
    const llm = provider(slowFetch(pieces), 100);
    expect(await collect(llm.chatStream([{ role: 'user', content: 'x' }]))).toBe('p0 p1 p2 p3 p4 p5 ');
  });

  it('times out when the stream goes quiet mid-answer', async () => {
    const llm = provider(
      slowFetch([
        { afterMs: 10, content: 'Braise ' },
        { afterMs: 10_000, content: 'never' },
      ]),
      80,
    );
    await expect(collect(llm.chatStream([{ role: 'user', content: 'x' }]))).rejects.toThrow('did not respond within');
  });

  it('asks Ollama to keep the model loaded when configured', async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ message: { content: 'ok' } }));
    const llm = new OllamaProvider({
      baseUrl: 'http://ollama.test:11434',
      embeddingModel: 'nomic-embed-text',
      chatModel: 'qwen2.5:3b',
      timeoutMs: 5_000,
      keepAlive: '30m',
      fetch: fetchImpl,
    });
    await llm.chat([{ role: 'user', content: 'x' }]);
    expect(calls[0]?.body).toMatchObject({ keep_alive: '30m' });
  });
});
