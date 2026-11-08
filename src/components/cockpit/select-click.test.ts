import type { MouseEvent } from 'react';
import { describe, expect, it } from 'vitest';

import { isSelectClick, selectModeOf } from './select-click';

const click = (keys: Partial<MouseEvent>) =>
  ({
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...keys,
  }) as MouseEvent;

describe('isSelectClick', () => {
  it('is a Cmd-click, Ctrl-click or Shift-click', () => {
    expect(isSelectClick(click({ metaKey: true }))).toBe(true);
    expect(isSelectClick(click({ ctrlKey: true }))).toBe(true);
    expect(isSelectClick(click({ shiftKey: true }))).toBe(true);
  });

  it('is not a plain click, which opens the drawer', () => {
    expect(isSelectClick(click({}))).toBe(false);
  });
});

describe('selectModeOf', () => {
  it('asks for a range on a Shift-click and toggles otherwise', () => {
    expect(selectModeOf(click({ shiftKey: true }))).toBe('range');
    expect(selectModeOf(click({ metaKey: true }))).toBe('toggle');
  });

  it('toggles for an event without keys', () => {
    expect(selectModeOf(new Event('change'))).toBe('toggle');
  });
});
