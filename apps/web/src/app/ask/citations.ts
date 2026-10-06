export type AnswerPart = { text: string } | { cites: number[] };

/** Splits "Simmer 2 hours [1][2]. Bake 1 hour [1, 3]." into text and citation parts for rendering links. */
export function splitCitations(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const match of answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    if (match.index > last) parts.push({ text: answer.slice(last, match.index) });
    parts.push({ cites: match[1].split(',').map((n) => Number(n.trim())) });
    last = match.index + match[0].length;
  }
  if (last < answer.length) parts.push({ text: answer.slice(last) });
  return parts;
}
