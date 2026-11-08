import { describe, expect, it } from 'vitest';

import { namePastedFile } from './pasted-file-name';

// Local time, as the paste happens on the User's machine.
const now = () => new Date(2026, 2, 7, 9, 5, 3);

describe('namePastedFile', () => {
  it('names a generic clipboard image from the local time of the paste', () => {
    const file = new File(['png'], 'image.png', { type: 'image/png' });

    const named = namePastedFile(file, now);

    expect(named.name).toBe('Pasted image 2026-03-07 09.05.03.png');
    expect(named.type).toBe('image/png');
    expect(named.size).toBe(3);
  });

  it('takes the extension from the media type, not the generic name', () => {
    const file = new File(['x'], 'image.png', { type: 'image/jpeg' });

    expect(namePastedFile(file, now).name).toBe(
      'Pasted image 2026-03-07 09.05.03.jpg',
    );
    expect(
      namePastedFile(new File(['x'], 'image.gif', { type: 'image/gif' }), now)
        .name,
    ).toBe('Pasted image 2026-03-07 09.05.03.gif');
    expect(
      namePastedFile(
        new File(['x'], 'image.svg', { type: 'image/svg+xml' }),
        now,
      ).name,
    ).toBe('Pasted image 2026-03-07 09.05.03.svg');
  });

  it('keeps the name of any other file', () => {
    for (const file of [
      new File(['x'], 'shot.png', { type: 'image/png' }),
      new File(['x'], 'image.txt', { type: 'text/plain' }),
      new File(['x'], 'image', { type: 'image/png' }),
      new File(['x'], 'my image.png', { type: 'image/png' }),
    ]) {
      expect(namePastedFile(file, now)).toBe(file);
    }
  });
});
