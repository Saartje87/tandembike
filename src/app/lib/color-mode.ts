import { type ColorModeSetting, colorModeAttribute } from '@blockle/blocks';

/** Where this browser keeps the User's Color mode choice. */
export const colorModeStorageKey = 'tandembike:color-mode';

const settings: ColorModeSetting[] = ['light', 'dark', 'system'];

const listeners = new Set<() => void>();

function isColorModeSetting(value: unknown): value is ColorModeSetting {
  return settings.includes(value as ColorModeSetting);
}

/**
 * The stored Color mode choice, or `system` when there is none, it is no
 * Color mode, or storage cannot be read.
 */
export function readColorMode(): ColorModeSetting {
  try {
    const value = localStorage.getItem(colorModeStorageKey);
    return isColorModeSetting(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

/** Stores the choice and tells this tab's subscribers. */
export function writeColorMode(setting: ColorModeSetting) {
  try {
    localStorage.setItem(colorModeStorageKey, setting);
  } catch {
    // Storage is full or blocked: the choice is lost, as without storage.
  }
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Calls `onChange` when the choice changes, in this tab or another one (a
 * `storage` event only reaches the other tabs). Returns the unsubscribe.
 */
export function subscribeToColorMode(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === colorModeStorageKey || event.key === null) {
      onChange();
    }
  };
  listeners.add(onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Runs in `<head>` before first paint and puts the stored choice on `<html>`,
 * where Blocks reads it. Without a valid choice it leaves `<html>` alone,
 * which Blocks treats as `system`.
 */
export const colorModeScript = `(function(){try{var m=localStorage.getItem(${JSON.stringify(colorModeStorageKey)});if(${JSON.stringify(settings)}.indexOf(m)>-1)document.documentElement.setAttribute(${JSON.stringify(colorModeAttribute)},m)}catch(e){}})()`;
