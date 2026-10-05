import type { DocumentKind } from '@stockpot/shared';

export const KIND_LABELS: Record<DocumentKind, string> = {
  recipe: 'Recipe',
  technique: 'Technique',
  note: 'Note',
};

/** Byte counts as "820 B" or "12.4 KB". Uploads are capped well below a megabyte. */
export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/** Anchor id for a chunk on its document page, so search results and citations can link straight to it. */
export function chunkAnchor(chunkId: string): string {
  return `chunk-${chunkId}`;
}

/** The chunk text starts with its heading path line, which pages show separately. */
export function chunkBody(content: string): string {
  const blank = content.indexOf('\n\n');
  return blank === -1 ? content : content.slice(blank + 2);
}
