/** What Copilot reports about an error, from `session.error` or a thrown one. */
export type CopilotError = {
  message: string;
  errorType?: string;
  statusCode?: number;
};

const transientTypes = new Set(['rate_limit', 'network', 'timeout']);

const transientMarkers = [
  /overloaded/,
  /rate[_ ]limit/,
  /econnreset/,
  /econnrefused/,
  /etimedout/,
  /enotfound/,
  /fetch failed/,
  /socket hang up/,
];

/**
 * Whether a Copilot run's error is worth resuming once (ADR 0034, ADR 0051):
 * a rate limit, a 429 or 5xx, or a network error is; an authentication,
 * policy or quota error, and every other, is not.
 */
export function isTransientCopilotError({
  message,
  errorType,
  statusCode,
}: CopilotError): boolean {
  if (errorType !== undefined && transientTypes.has(errorType)) {
    return true;
  }
  if (statusCode !== undefined) {
    return statusCode === 429 || statusCode >= 500;
  }
  const text = message.toLowerCase();
  return transientMarkers.some((marker) => marker.test(text));
}
