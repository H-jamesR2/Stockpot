import { describe, expect, it } from 'vitest';
import { cleanCitations, DeclineMarkerFilter, withinBudget } from '../src/modules/ask/answer-text.js';

describe('withinBudget', () => {
  const source = (chars: number) => ({ content: 'x'.repeat(chars) });

  it('keeps sources in order until the next would go over the budget', () => {
    const kept = withinBudget([source(400), source(400), source(400)], 250);
    expect(kept).toHaveLength(2);
  });

  it('always keeps the first source even when it alone is over budget', () => {
    expect(withinBudget([source(4000), source(4)], 100)).toHaveLength(1);
  });
});

describe('cleanCitations', () => {
  it('keeps valid citations and lists them in order of first use', () => {
    expect(cleanCitations('Sear it [2]. Braise it [1][2].', 3)).toEqual({
      answer: 'Sear it [2]. Braise it [1][2].',
      citations: [2, 1],
      invalidCitations: [],
    });
  });

  it('removes citations to sources that were not provided', () => {
    expect(cleanCitations('Use stock [1, 9]. Wine works [9]. Done [4].', 3)).toEqual({
      answer: 'Use stock [1]. Wine works. Done.',
      citations: [1],
      invalidCitations: [9, 4],
    });
  });

  it('reports no citations for an answer without any', () => {
    expect(cleanCitations('Braise for three hours.', 2)).toEqual({
      answer: 'Braise for three hours.',
      citations: [],
      invalidCitations: [],
    });
  });
});

describe('DeclineMarkerFilter', () => {
  function run(pieces: string[]) {
    const filter = new DeclineMarkerFilter();
    const shown = pieces.map((p) => filter.push(p)).join('');
    return { shown, declined: filter.isDecline(pieces.join('')) };
  }

  it('never shows any part of the decline marker', () => {
    expect(run(['NO', '_AN', 'SWER'])).toEqual({ shown: '', declined: true });
    expect(run(['  NO_ANSWER', '.'])).toEqual({ shown: '', declined: true });
  });

  it('releases held text as soon as it cannot be the marker', () => {
    expect(run(['NO', 'w braise', ' it.'])).toEqual({ shown: 'NOw braise it.', declined: false });
    expect(run(['Braise ', 'it.'])).toEqual({ shown: 'Braise it.', declined: false });
  });
});
