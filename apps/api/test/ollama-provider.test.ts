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
