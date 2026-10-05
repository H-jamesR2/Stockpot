import type { DocumentDetail, DocumentSummary } from '@stockpot/shared';

export function summary(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: '00000000-0000-4000-8000-000000000101',
    kind: 'recipe',
    title: 'Beef Pot Roast',
    recipeSlug: 'beef-pot-roast',
    contentType: 'text/markdown',
    byteSize: 1536,
    chunkCount: 3,
    embeddingModel: 'nomic-embed-text',
    ingestedAt: '2026-10-05T21:30:00.000Z',
    createdAt: '2026-10-05T21:30:00.000Z',
    ...overrides,
  };
}

export function detail(overrides: Partial<DocumentDetail> = {}): DocumentDetail {
  return {
    ...summary(),
    chunks: [
      {
        id: '00000000-0000-4000-8000-000000000201',
        position: 0,
        content: 'Beef Pot Roast\n\nThis pot roast is seasoned with orange juice.',
        tokenCount: 14,
        headings: [],
      },
      {
        id: '00000000-0000-4000-8000-000000000202',
        position: 1,
        content: 'Beef Pot Roast > Steps\n\n1. Cover and simmer for 2 hours.',
        tokenCount: 13,
        headings: ['Beef Pot Roast', 'Steps'],
      },
    ],
    ...overrides,
  };
}
