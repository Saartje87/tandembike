/**
 * A 429 or 5xx counts only as an HTTP status: after `API Error:`, `status`,
 * `status code` or `HTTP`, or as the whole text's leading code, so a port or
 * a count in a message does not match.
 */
const statusMarker =
  /(?:^\s*|(?:api error|status(?: code)?|http(?:\/[\d.]+)?):?\s*)(?:429|5\d\d)\b/;

const transientMarkers = [
  statusMarker,
  /overloaded/,
  /rate[_ ]limit/,
  /api_error/,
  /econnreset/,
  /etimedout/,
  /enotfound/,
  /fetch failed/,
  /socket hang up/,
];

/**
 * Whether a Claude run's error is worth resuming (ADR 0034): an API
 * overload, rate limit, server error or network error is transient; every
 * other error, including `error_max_turns` and `error_during_execution`, is
 * not. Reads the error text and the SDK's result subtype, which only the
 * Claude runner sees (ADR 0051).
 */
export function isTransientClaudeError(error: string, subtype = ''): boolean {
  const text = `${error} ${subtype}`.toLowerCase();
  return transientMarkers.some((marker) => marker.test(text));
}
