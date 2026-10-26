/** A scheme, such as `https:` or `javascript:`, at the start of a value. */
const schemePattern = /^[a-z][a-z\d+.-]*:/i;

/** Whether `reference` starts with a scheme, so it must be a URL, not a key. */
export function hasScheme(reference: string): boolean {
  return schemePattern.test(reference);
}

/** `reference` as an absolute http(s) URL, or `null` when it is not one. */
export function httpUrl(reference: string): URL | null {
  const url = hasScheme(reference) ? URL.parse(reference) : null;
  return url && /^https?:$/.test(url.protocol) ? url : null;
}

/** How an External reference shows: a URL as a link, a key as plain text. */
export type ExternalReferenceDisplay = { text: string; href?: string };

/** A GitHub issue or pull request path: owner, repository and number. */
const githubIssuePath = /^\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)(?:\/|$)/;

/**
 * `reference` as it shows: an http(s) URL links to itself with shorter
 * text, `owner/repo#87` for a GitHub issue or pull request and host and
 * path otherwise; anything else, such as a key, shows as typed.
 */
export function externalReferenceDisplay(
  reference: string,
): ExternalReferenceDisplay {
  const url = httpUrl(reference);
  if (url === null) {
    return { text: reference };
  }
  const github =
    url.hostname === 'github.com' ? githubIssuePath.exec(url.pathname) : null;
  return {
    text: github
      ? `${github[1]}/${github[2]}#${github[3]}`
      : `${url.host}${url.pathname.replace(/\/+$/, '')}`,
    href: reference,
  };
}
