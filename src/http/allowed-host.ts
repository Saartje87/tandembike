/** Loopback host names the app answers to (ADR 0001), on any port. */
const allowedHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);

const hostPattern = /^(\[[^\]]*\]|[^:]+)(?::(\d+))?$/;

/**
 * Whether a request's Host header names this machine's loopback interface.
 * Anything else may be a DNS rebinding attack: a page on another site whose
 * name was re-pointed at 127.0.0.1, which must not reach the app.
 */
export function isAllowedHost(host: string | null): boolean {
  const match = host ? hostPattern.exec(host) : null;
  return match !== null && allowedHostnames.has(match[1].toLowerCase());
}
