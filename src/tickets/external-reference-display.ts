import type { ReferenceTemplate } from './reference-templates';

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

/**
 * How an External reference shows: a URL, or a key a Reference template
 * matches, as a link; any other key as plain text.
 */
export type ExternalReferenceDisplay = { text: string; href?: string };

/** A GitHub issue or pull request path: owner, repository and number. */
const githubIssuePath = /^\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)(?:\/|$)/;

/** The prefix and URL of a Reference template, enough to link a key. */
export type ReferenceTemplateLink = Pick<ReferenceTemplate, 'prefix' | 'url'>;

/**
 * Key `reference` linked by the first of `templates` whose prefix it starts
 * with, every `{n}` replaced by the rest of the key, URL-encoded; as typed
 * when none matches or nothing follows the prefix.
 */
function keyDisplay(
  reference: string,
  templates: readonly ReferenceTemplateLink[],
): ExternalReferenceDisplay {
  const template = templates.find(({ prefix }) => reference.startsWith(prefix));
  const rest = template ? reference.slice(template.prefix.length) : '';
  if (!template || rest === '') {
    return { text: reference };
  }
  return {
    text: reference,
    href: template.url.replaceAll('{n}', encodeURIComponent(rest)),
  };
}

/**
 * `reference` as it shows: an http(s) URL links to itself with shorter
 * text, `owner/repo#87` for a GitHub issue or pull request and host and
 * path otherwise; a key shows as typed, linked by its Project's
 * `templates` when one matches.
 */
export function externalReferenceDisplay(
  reference: string,
  templates: readonly ReferenceTemplateLink[] = [],
): ExternalReferenceDisplay {
  const url = httpUrl(reference);
  if (url === null) {
    return keyDisplay(reference, templates);
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
