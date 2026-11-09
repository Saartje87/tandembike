/** The labels that mark a feedback Ticket: friction an Agent or Tandembike reported. */
export const feedbackLabels = ['from:agent-run', 'from:tandembike'] as const;

/** The most feedback Tickets one run may file. */
export const maxFeedbackPerRun = 3;

/** The Jaccard word-set similarity at which two feedback titles are duplicates. */
export const duplicateSimilarity = 0.75;

/** Whether a Ticket with these (lower-cased) labels is a feedback Ticket. */
export const isFeedback = (labels: readonly string[]): boolean =>
  labels.some((label) => (feedbackLabels as readonly string[]).includes(label));

const stopWords = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'and',
  'or',
  'it',
  'its',
  'this',
  'that',
  'with',
  'when',
  'not',
]);

/** The lowercased words of `title`, without punctuation and stop words. */
export function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word !== '' && !stopWords.has(word)),
  );
}

/** Shared words over all words of the two titles; two titles without words are alike. */
export function jaccardSimilarity(a: string, b: string): number {
  const first = titleWords(a);
  const second = titleWords(b);
  if (first.size === 0 && second.size === 0) {
    return 1;
  }
  let shared = 0;
  for (const word of first) {
    if (second.has(word)) {
      shared++;
    }
  }
  return shared / (first.size + second.size - shared);
}
