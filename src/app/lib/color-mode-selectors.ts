import {
  type ColorMode,
  colorModeSelector,
  systemColorModeQuery,
  systemColorModeSelectors,
} from '@blockle/blocks';

/**
 * Where the resolved Color mode is `mode`, for CSS beyond the Color roles:
 * `set`, the `<html>` selector when the User picked `mode`, and `system`,
 * the `<html>` selectors that follow the OS, which resolve to `mode` under
 * the media query `query`.
 */
export function colorModeSelectors(mode: ColorMode) {
  return {
    set: colorModeSelector(mode),
    system: systemColorModeSelectors.join(', '),
    query: systemColorModeQuery(mode),
  };
}
