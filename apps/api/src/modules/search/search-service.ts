import type { SearchQuery, SearchResult } from '@stockpot/shared';
import { sql } from 'kysely';
import type { Database } from '../../db/index.js';
import type { LlmProvider } from '../../llm/index.js';

/** How many chunks each retriever contributes before fusion. */
export const CANDIDATES_PER_RETRIEVER = 40;
/**
 * The usual reciprocal rank fusion constant. It keeps a chunk ranked first by one retriever from
 * outweighing a chunk ranked well by both.
 */
export const RRF_K = 60;

interface ResultRow {
  chunk_id: string;
  document_id: string;
  document_title: string;
  document_kind: SearchResult['documentKind'];
  recipe_slug: string | null;
  metadata: Record<string, unknown>;
  content: string;
  score: number;
  vector_rank: number | null;
  text_rank: number | null;
}

/**
 * Hybrid retrieval: vector similarity and Postgres full-text ranking each pick candidates, and
 * reciprocal rank fusion combines them by rank, so the two very different score scales never
 * need calibrating against each other.
 */
export class SearchService {
  constructor(
    private readonly db: Database,
    private readonly llm: LlmProvider,
  ) {}

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const [embedding] = await this.llm.embed([query.q], 'query');
    const vector = `[${embedding!.join(',')}]`;
    const kind = query.kind ?? null;

    const { rows } = await sql<ResultRow>`
      -- OR the stemmed query words. People type questions, and requiring every word ("how long to
      -- braise chuck") would rarely match. ts_rank_cd still favors chunks with more words close together.
      with ts as (
        select to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) as query
        from unnest(to_tsvector('english', ${query.q}))
      ),
      -- Vectors from different models are not comparable, so only chunks embedded by the current one count.
      vector_hits as (
        select c.id, row_number() over (order by c.embedding <=> ${vector}::vector) as rank
        from chunks c
        join documents d on d.id = c.document_id
        where c.embedding_model = ${this.llm.embeddingModel}
          and (${kind}::document_kind is null or d.kind = ${kind}::document_kind)
        order by c.embedding <=> ${vector}::vector
        limit ${CANDIDATES_PER_RETRIEVER}
      ),
      text_hits as (
        select c.id, row_number() over (order by ts_rank_cd(c.tsv, ts.query) desc, c.id) as rank
        from chunks c
        join documents d on d.id = c.document_id
        cross join ts
        where c.tsv @@ ts.query
          and (${kind}::document_kind is null or d.kind = ${kind}::document_kind)
        order by ts_rank_cd(c.tsv, ts.query) desc, c.id
        limit ${CANDIDATES_PER_RETRIEVER}
      ),
      fused as (
        select id,
               sum(1.0 / (${RRF_K} + rank))::float8 as score,
               min(vector_rank)::int as vector_rank,
               min(text_rank)::int as text_rank
        from (
          select id, rank, rank as vector_rank, null::bigint as text_rank from vector_hits
          union all
          select id, rank, null, rank from text_hits
        ) hits
        group by id
      ),
      per_document as (
        select f.*, c.document_id,
               row_number() over (partition by c.document_id order by f.score desc, f.id) as document_rank
        from fused f
        join chunks c on c.id = f.id
      )
      select
        c.id as chunk_id,
        d.id as document_id,
        d.title as document_title,
        d.kind as document_kind,
        r.slug as recipe_slug,
        c.metadata,
        c.content,
        p.score,
        p.vector_rank,
        p.text_rank
      from per_document p
      join chunks c on c.id = p.id
      join documents d on d.id = c.document_id
      left join recipes r on r.id = d.recipe_id
      where p.document_rank <= ${query.perDocument}
      order by p.score desc, c.id
      limit ${query.limit}
    `.execute(this.db);

    return rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      documentKind: row.document_kind,
      recipeSlug: row.recipe_slug,
      headings: Array.isArray(row.metadata['headings']) ? (row.metadata['headings'] as string[]) : [],
      content: row.content,
      score: Math.round(row.score * 1e6) / 1e6,
      vectorRank: row.vector_rank,
      textRank: row.text_rank,
    }));
  }
}
