import { describe, expect, it } from 'vitest';

import { isStatus } from './status';

describe('isStatus', () => {
  it.each(['Todo', 'In progress', 'Done'])('accepts %s', (value) => {
    expect(isStatus(value)).toBe(true);
  });

  it.each(['todo', 'Doing', '', undefined, 1])('refuses %s', (value) => {
    expect(isStatus(value)).toBe(false);
  });
});
