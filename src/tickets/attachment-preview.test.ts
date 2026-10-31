import { describe, expect, it } from 'vitest';

import {
  formatSize,
  isPreviewable,
  isTextMediaType,
} from './attachment-preview';

describe('isPreviewable', () => {
  it('accepts PNG, JPEG, GIF and WebP only', () => {
    expect(
      ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].every(
        isPreviewable,
      ),
    ).toBe(true);
    expect(isPreviewable('image/svg+xml')).toBe(false);
    expect(isPreviewable('application/pdf')).toBe(false);
  });
});

describe('isTextMediaType', () => {
  it('accepts text/*, JSON, XML, YAML and JavaScript types', () => {
    for (const type of [
      'text/plain',
      'text/html',
      'application/json',
      'application/ld+json',
      'application/xml',
      'image/svg+xml',
      'application/yaml',
      'application/javascript',
    ]) {
      expect(isTextMediaType(type)).toBe(true);
    }
    expect(isTextMediaType('application/pdf')).toBe(false);
    expect(isTextMediaType('image/png')).toBe(false);
    expect(isTextMediaType('application/octet-stream')).toBe(false);
  });
});

describe('formatSize', () => {
  it('reads bytes as B, KB or MB', () => {
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(10 * 1024 * 1024)).toBe('10 MB');
  });
});
