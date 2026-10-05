import { describe, expect, it } from 'vitest';
import { chunkMarkdown, estimateTokens } from '../src/modules/documents/chunker.js';

const small = { targetTokens: 40, maxTokens: 60, overlapTokens: 10 };

describe('chunkMarkdown', () => {
  it('keeps a short document in one chunk prefixed with its title', () => {
    const chunks = chunkMarkdown('Braise low and slow.', 'Braising');
    expect(chunks).toEqual([
      {
        content: 'Braising\n\nBraise low and slow.',
        tokenCount: estimateTokens('Braising\n\nBraise low and slow.'),
        headings: [],
      },
    ]);
  });

  it('follows the heading path and does not repeat a top heading that matches the title', () => {
    const md = '# Braising\n\nIntro.\n\n## Liquids\n\nUse stock.\n\n### Wine\n\nDeglaze first.\n\n## Timing\n\nHours.';
    const chunks = chunkMarkdown(md, 'Braising');
    expect(chunks.map((c) => c.headings)).toEqual([
      ['Braising'],
      ['Braising', 'Liquids'],
      ['Braising', 'Liquids', 'Wine'],
      ['Braising', 'Timing'],
    ]);
    expect(chunks[2]?.content).toBe('Braising > Liquids > Wine\n\nDeglaze first.');
    expect(chunks[3]?.content.startsWith('Braising > Timing\n\n')).toBe(true);
  });

  it('skips headings with no text under them and ignores # inside code fences', () => {
    const md = '# Empty\n\n# Real\n\n```\n# not a heading\n```\nText.';
    const chunks = chunkMarkdown(md, 'Doc');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.headings).toEqual(['Real']);
    expect(chunks[0]?.content).toContain('# not a heading');
  });

  it('packs paragraphs up to the target and never exceeds the max', () => {
    const paragraph = 'Sear the meat well. Add the onions. Pour in the stock. Cover and braise.';
    const md = Array.from({ length: 8 }, () => paragraph).join('\n\n');
    const chunks = chunkMarkdown(md, 'Method', small);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.tokenCount).toBeLessThanOrEqual(small.maxTokens);
  });

  it('splits a paragraph that is too long by sentence, then by word', () => {
    const longSentence = 'word '.repeat(200).trim();
    const chunks = chunkMarkdown(`First sentence here. ${longSentence}.`, 'Doc', small);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) expect(chunk.tokenCount).toBeLessThanOrEqual(small.maxTokens);
    expect(chunks.map((c) => c.content.replace(/^Doc\n\n/, '')).join(' ')).toContain('First sentence here.');
  });

  it('carries trailing sentences into the next chunk of the same section', () => {
    const md = [
      'One one one one one. Two two two two two.',
      'Three three three three three. Four four four four.',
      'Five five five five five. Six six six six six.',
    ].join('\n\n');
    const chunks = chunkMarkdown(md, 'T', { targetTokens: 30, maxTokens: 60, overlapTokens: 12 });
    expect(chunks.length).toBeGreaterThan(1);
    const lastSentenceOfFirst = chunks[0]!.content
      .trim()
      .split(/(?<=[.!?])\s+/)
      .pop()!;
    expect(chunks[1]?.content).toContain(lastSentenceOfFirst);
  });

  it('returns nothing for whitespace', () => {
    expect(chunkMarkdown(' \n\n \n', 'Empty')).toEqual([]);
  });
});
