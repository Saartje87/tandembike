// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { externalReferenceDisplay } from './external-reference-display';

const templates = [
  { prefix: '#', url: 'https://github.com/acme/web/issues/{n}' },
  { prefix: 'ABC-', url: 'https://acme.atlassian.net/browse/ABC-{n}' },
  { prefix: 'A', url: 'https://example.com/a/{n}' },
];

describe('externalReferenceDisplay', () => {
  it('shows a key as plain text without templates', () => {
    expect(externalReferenceDisplay('#55')).toEqual({ text: '#55' });
  });

  it('links a key to the first template whose prefix it starts with', () => {
    expect(externalReferenceDisplay('#55', templates)).toEqual({
      text: '#55',
      href: 'https://github.com/acme/web/issues/55',
    });
    expect(externalReferenceDisplay('ABC-33', templates)).toEqual({
      text: 'ABC-33',
      href: 'https://acme.atlassian.net/browse/ABC-33',
    });
  });

  it('applies the first matching template in order', () => {
    const [, , a] = templates;

    expect(externalReferenceDisplay('ABC-33', [a, ...templates])).toEqual({
      text: 'ABC-33',
      href: 'https://example.com/a/BC-33',
    });
  });

  it('replaces every {n} with the rest of the key, URL-encoded', () => {
    expect(
      externalReferenceDisplay('#a/b?c', [
        { prefix: '#', url: 'https://example.com/{n}?q={n}' },
      ]),
    ).toEqual({
      text: '#a/b?c',
      href: 'https://example.com/a%2Fb%3Fc?q=a%2Fb%3Fc',
    });
  });

  it('keeps a key matching no template, or only its prefix, as plain text', () => {
    expect(externalReferenceDisplay('owner/repo#55', templates)).toEqual({
      text: 'owner/repo#55',
    });
    expect(externalReferenceDisplay('#', templates)).toEqual({ text: '#' });
  });

  it('leaves a URL to link to itself', () => {
    expect(
      externalReferenceDisplay('https://example.com/a', [
        { prefix: 'https', url: 'https://example.com/{n}' },
      ]),
    ).toEqual({ text: 'example.com/a', href: 'https://example.com/a' });
  });
});
