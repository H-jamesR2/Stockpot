export interface ChunkOptions {
  /** Pack paragraphs until a chunk reaches about this many tokens. */
  targetTokens: number;
  /** No chunk goes over this. Longer paragraphs are split by line, then sentence, then word. */
  maxTokens: number;
  /** Carry this many tokens of trailing sentences into the next chunk of the same section. */
  overlapTokens: number;
}

// nomic-embed-text runs with a 2,048 token window in Ollama, so 600 leaves plenty of room.
export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { targetTokens: 450, maxTokens: 600, overlapTokens: 60 };

export interface TextChunk {
  /** Starts with the heading path so the embedding and any citation keep their context. */
  content: string;
  tokenCount: number;
  /** Heading path under the document title, outermost first. */
  headings: string[];
}

/** A rough count, about four characters per token for English. Close enough for sizing chunks. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

interface Section {
  headings: string[];
  body: string;
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const stack: { level: number; text: string }[] = [];
  let lines: string[] = [];
  let inFence = false;

  const flush = () => {
    const body = lines.join('\n').trim();
    if (body) sections.push({ headings: stack.map((h) => h.text), body });
    lines = [];
  };

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE.test(line)) inFence = !inFence;
    const heading = inFence ? null : HEADING.exec(line);
    if (!heading) {
      lines.push(line);
      continue;
    }
    flush();
    const level = heading[1]!.length;
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push({ level, text: heading[2]! });
  }
  flush();
  return sections;
}

function splitByWords(text: string, maxTokens: number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (current && estimateTokens(next) > maxTokens) {
      pieces.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Breaks a block into pieces that each fit maxTokens, preferring line, then sentence, then word boundaries. */
function splitBlock(block: string, maxTokens: number): string[] {
  if (estimateTokens(block) <= maxTokens) return [block];
  const lines = block.split('\n').filter((l) => l.trim());
  if (lines.length > 1)
    return packPieces(
      lines.flatMap((l) => splitBlock(l, maxTokens)),
      maxTokens,
      '\n',
    );
  const sentences = block.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1)
    return packPieces(
      sentences.flatMap((s) => splitBlock(s, maxTokens)),
      maxTokens,
      ' ',
    );
  return splitByWords(block, maxTokens);
}

function packPieces(pieces: string[], maxTokens: number, separator: string): string[] {
  const packed: string[] = [];
  let current = '';
  for (const piece of pieces) {
    const next = current ? `${current}${separator}${piece}` : piece;
    if (current && estimateTokens(next) > maxTokens) {
      packed.push(current);
      current = piece;
    } else {
      current = next;
    }
  }
  if (current) packed.push(current);
  return packed;
}

/** Trailing whole sentences of a chunk body, up to the overlap budget. */
function overlapFrom(body: string, overlapTokens: number): string {
  if (overlapTokens <= 0) return '';
  const sentences = body.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  for (let i = sentences.length - 1; i >= 0; i--) {
    const candidate = [sentences[i]!, ...kept].join(' ');
    if (estimateTokens(candidate) > overlapTokens) break;
    kept.unshift(sentences[i]!);
  }
  // Never repeat the whole chunk.
  return kept.length === sentences.length ? '' : kept.join(' ');
}

function headingPrefix(title: string, headings: string[]): string {
  const path = [title, ...headings].filter((part, i, all) => i === 0 || part !== all[i - 1]);
  return path.join(' > ');
}

/**
 * Splits Markdown or plain text into retrieval chunks. Sections follow headings, paragraphs pack
 * into chunks of about targetTokens, and consecutive chunks in one section share a little overlap.
 */
export function chunkMarkdown(markdown: string, title: string, options = DEFAULT_CHUNK_OPTIONS): TextChunk[] {
  const chunks: TextChunk[] = [];

  for (const section of splitSections(markdown)) {
    const prefix = headingPrefix(title, section.headings);
    const budget = Math.max(1, options.targetTokens - estimateTokens(prefix));
    const limit = Math.max(1, options.maxTokens - estimateTokens(prefix));
    const pieces = section.body
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .flatMap((block) => splitBlock(block, limit));

    let body = '';
    const emit = () => {
      const content = `${prefix}\n\n${body}`;
      chunks.push({ content, tokenCount: estimateTokens(content), headings: section.headings });
    };

    for (const piece of pieces) {
      const next = body ? `${body}\n\n${piece}` : piece;
      if (body && estimateTokens(next) > budget) {
        emit();
        const overlap = overlapFrom(body, options.overlapTokens);
        const carried = overlap ? `${overlap}\n\n${piece}` : piece;
        body = estimateTokens(carried) <= limit ? carried : piece;
      } else {
        body = next;
      }
    }
    if (body) emit();
  }
  return chunks;
}
