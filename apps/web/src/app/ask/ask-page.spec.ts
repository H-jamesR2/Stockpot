import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AskEvent, AskResult, AskSource } from '@stockpot/shared';
import { AskClient } from './ask-client';
import { AskPage } from './ask-page';

const sources: AskSource[] = [
  {
    n: 1,
    chunkId: '00000000-0000-4000-8000-000000000401',
    documentId: '00000000-0000-4000-8000-000000000101',
    documentTitle: 'Pot Roasted Beef',
    documentKind: 'recipe',
    recipeSlug: 'pot-roasted-beef',
    headings: ['Pot Roasted Beef', 'Steps'],
    content: 'Pot Roasted Beef > Steps\n\nBake for 1 hour.',
    vectorDistance: 0.1218,
  },
  {
    n: 2,
    chunkId: '00000000-0000-4000-8000-000000000402',
    documentId: '00000000-0000-4000-8000-000000000102',
    documentTitle: 'Beef Pot Roast',
    documentKind: 'recipe',
    recipeSlug: 'beef-pot-roast',
    headings: ['Beef Pot Roast', 'Steps'],
    content: 'Beef Pot Roast > Steps\n\nCover and simmer for 2 hours.',
    vectorDistance: 0.1619,
  },
];

function result(overrides: Partial<AskResult> = {}): AskResult {
  return {
    answer: 'Simmer it for 2 hours [2]. Or bake it for 1 hour [1].',
    declined: false,
    grounded: true,
    citations: [2, 1],
    invalidCitations: [],
    model: 'qwen2.5:3b',
    elapsedMs: 98_500,
    ...overrides,
  };
}

/** Plays back scripted events, or waits until aborted when told to hang. */
class FakeAskClient {
  events: AskEvent[] = [];
  hang = false;
  requests: string[] = [];

  async *stream(request: { question: string }, signal?: AbortSignal): AsyncGenerator<AskEvent> {
    this.requests.push(request.question);
    for (const event of this.events) yield event;
    if (this.hang) {
      await new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    }
  }
}

describe('AskPage', () => {
  let client: FakeAskClient;

  beforeEach(() => {
    client = new FakeAskClient();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AskClient, useValue: client }] });
  });

  async function askQuestion(question = 'How long should I cook the beef pot roast?') {
    const fixture = TestBed.createComponent(AskPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLTextAreaElement>('textarea')!.value = question;
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    return { fixture, element };
  }

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('shows the answer with each citation linked to its source chunk', async () => {
    client.events = [
      { type: 'sources', sources },
      { type: 'token', text: 'Simmer it ' },
      { type: 'done', result: result() },
    ];
    const { element } = await askQuestion();

    expect(client.requests).toEqual(['How long should I cook the beef pot roast?']);
    expect(text(element.querySelector('.answer .text'))).toBe('Simmer it for 2 hours [2]. Or bake it for 1 hour [1].');

    const cites = [...element.querySelectorAll<HTMLAnchorElement>('a.cite')];
    expect(cites.map((a) => a.textContent)).toEqual(['[2]', '[1]']);
    expect(cites[0]?.getAttribute('href')).toBe(
      '/documents/00000000-0000-4000-8000-000000000102#chunk-00000000-0000-4000-8000-000000000402',
    );
    expect(cites[0]?.getAttribute('aria-label')).toBe('Source 2: Beef Pot Roast > Steps');
    expect(text(element.querySelector('.meta'))).toBe('qwen2.5:3b · 98.5 s');
  });

  it('lists the sources with their numbers and distances', async () => {
    client.events = [
      { type: 'sources', sources },
      { type: 'done', result: result() },
    ];
    const { element } = await askQuestion();
    const items = element.querySelectorAll('.sources li');
    expect([...items].map((li) => li.getAttribute('value'))).toEqual(['1', '2']);
    expect(text(items[1])).toBe('Beef Pot Roast > Steps distance 0.16');
  });

  it('shows streamed text while the answer is still being written', async () => {
    client.events = [
      { type: 'sources', sources },
      { type: 'token', text: 'Simmer it ' },
      { type: 'token', text: 'for 2 hours' },
    ];
    client.hang = true;
    const { element } = await askQuestion();
    expect(text(element.querySelector('.streaming'))).toBe('Simmer it for 2 hours');
    expect(text(element.querySelector('[role=status]'))).toContain('Writing the answer');
    expect([...element.querySelectorAll('button')].some((b) => text(b) === 'Stop')).toBe(true);
  });

  it('stops the stream when the user clicks Stop', async () => {
    client.events = [{ type: 'sources', sources }];
    client.hang = true;
    const { fixture, element } = await askQuestion();
    [...element.querySelectorAll('button')].find((b) => text(b) === 'Stop')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(text(element.querySelector('.answer .note'))).toBe('Stopped.');
    expect([...element.querySelectorAll('button')].some((b) => text(b) === 'Ask')).toBe(true);
  });

  it('shows a decline without citations or sources', async () => {
    client.events = [
      { type: 'sources', sources: [] },
      {
        type: 'done',
        result: result({ answer: "I couldn't find that in your documents.", declined: true, citations: [] }),
      },
    ];
    const { element } = await askQuestion('How do I change a flat tire?');
    expect(text(element.querySelector('.declined'))).toBe("I couldn't find that in your documents.");
    expect(element.querySelector('.sources')).toBeNull();
  });

  it('warns about answers with no citations and notes removed ones', async () => {
    client.events = [
      { type: 'sources', sources },
      {
        type: 'done',
        result: result({ answer: 'Cook it a while.', grounded: false, citations: [], invalidCitations: [7] }),
      },
    ];
    const { element } = await askQuestion();
    expect(text(element.querySelector('.warning'))).toBe('This answer cites no sources. Treat it with caution.');
    expect(text(element.querySelector('.answer .note'))).toBe(
      'Removed citations to sources that were never provided: 7.',
    );
  });

  it('shows a model error from the stream', async () => {
    client.events = [
      { type: 'sources', sources },
      { type: 'error', message: 'Could not reach Ollama. Is it running?' },
    ];
    const { element } = await askQuestion();
    expect(text(element.querySelector('[role=alert]'))).toBe('Could not reach Ollama. Is it running?');
  });

  it('ignores an empty question', async () => {
    await askQuestion('   ');
    expect(client.requests).toEqual([]);
  });
});
