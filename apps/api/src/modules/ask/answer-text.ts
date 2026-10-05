import { estimateTokens } from '../documents/chunker.js';

/** What the model must reply when the sources do not answer the question. */
export const DECLINE_MARKER = 'NO_ANSWER';
export const DECLINE_MESSAGE = "I couldn't find that in your documents.";

/** Keeps sources in rank order until the next one would go over the token budget. Always keeps the first. */
export function withinBudget<T extends { content: string }>(sources: T[], maxTokens: number): T[] {
  const kept: T[] = [];
  let total = 0;
  for (const source of sources) {
    const tokens = estimateTokens(source.content);
    if (kept.length > 0 && total + tokens > maxTokens) break;
    kept.push(source);
    total += tokens;
  }
  return kept;
}

export interface CleanedAnswer {
  answer: string;
  citations: number[];
  invalidCitations: number[];
}

/**
 * Keeps only citations to sources that were actually provided. "[1, 9]" becomes "[1]" when there
 * are fewer than 9 sources, and a bracket left with no valid number is removed with its leading space.
 */
export function cleanCitations(text: string, sourceCount: number): CleanedAnswer {
  const citations: number[] = [];
  const invalid: number[] = [];
  const answer = text
    .replace(/\s*\[(\d+(?:\s*,\s*\d+)*)\]/g, (match, list: string) => {
      const numbers = list.split(',').map((n) => Number(n.trim()));
      const valid = numbers.filter((n) => n >= 1 && n <= sourceCount);
      for (const n of numbers) {
        if (valid.includes(n)) {
          if (!citations.includes(n)) citations.push(n);
        } else if (!invalid.includes(n)) {
          invalid.push(n);
        }
      }
      if (valid.length === 0) return '';
      const leading = match.slice(0, match.indexOf('['));
      return `${leading}[${valid.join(', ')}]`;
    })
    .trim();
  return { answer, citations, invalidCitations: invalid };
}

/**
 * Holds streamed text back while it could still turn out to be the decline marker, so a client
 * never sees "NO_AN" flash up before the decline is detected.
 */
export class DeclineMarkerFilter {
  private held = '';
  private passing = false;

  /** Returns text that is safe to show now. */
  push(piece: string): string {
    if (this.passing) return piece;
    this.held += piece;
    const trimmed = this.held.trimStart();
    if (DECLINE_MARKER.startsWith(trimmed) || trimmed.startsWith(DECLINE_MARKER)) return '';
    this.passing = true;
    const released = this.held;
    this.held = '';
    return released;
  }

  /** True when everything the model wrote was the marker. */
  isDecline(fullText: string): boolean {
    return fullText.trim().startsWith(DECLINE_MARKER);
  }
}
