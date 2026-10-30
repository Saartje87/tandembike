import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  colorModeScript,
  colorModeStorageKey,
  readColorMode,
  subscribeToColorMode,
  writeColorMode,
} from './color-mode';

const runScript = () => {
  new Function(colorModeScript)();
};

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-color-mode');
  vi.restoreAllMocks();
});

describe('readColorMode', () => {
  it('reads the stored choice', () => {
    localStorage.setItem(colorModeStorageKey, 'dark');

    expect(readColorMode()).toBe('dark');
  });

  it('falls back to system without a stored choice', () => {
    expect(readColorMode()).toBe('system');
  });

  it('falls back to system on a value that is no Color mode', () => {
    localStorage.setItem(colorModeStorageKey, 'blue');

    expect(readColorMode()).toBe('system');
  });

  it('falls back to system when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(readColorMode()).toBe('system');
  });
});

describe('writeColorMode', () => {
  it('stores the choice and tells subscribers', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToColorMode(onChange);

    writeColorMode('light');

    expect(localStorage.getItem(colorModeStorageKey)).toBe('light');
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not throw when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => writeColorMode('dark')).not.toThrow();
  });
});

describe('subscribeToColorMode', () => {
  it('tells subscribers when another tab changes the choice', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToColorMode(onChange);

    window.dispatchEvent(
      new StorageEvent('storage', { key: colorModeStorageKey }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('stops telling a subscriber once it unsubscribes', () => {
    const onChange = vi.fn();
    subscribeToColorMode(onChange)();

    writeColorMode('dark');
    window.dispatchEvent(
      new StorageEvent('storage', { key: colorModeStorageKey }),
    );

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('colorModeScript', () => {
  it('puts the stored choice on <html>', () => {
    localStorage.setItem(colorModeStorageKey, 'dark');

    runScript();

    expect(document.documentElement).toHaveAttribute('data-color-mode', 'dark');
  });

  it('leaves <html> alone, which follows the OS, on an invalid value', () => {
    localStorage.setItem(colorModeStorageKey, 'blue');

    runScript();

    expect(document.documentElement).not.toHaveAttribute('data-color-mode');
  });

  it('does not throw when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(runScript).not.toThrow();
    expect(document.documentElement).not.toHaveAttribute('data-color-mode');
  });
});
