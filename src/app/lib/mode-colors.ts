import type { BoxProps } from '@blockle/blocks';

type ModeColor = NonNullable<BoxProps['backgroundColor']>;

/**
 * Color roles as Mode values for the `color`, `backgroundColor` and
 * `borderColor` atoms, which take Palette shades but no roles (T338). Each
 * copies the momotaro role it is named after, unless its comment says
 * otherwise. In a `.css.ts` file, read the role from `vars.colorRole`.
 */
export const modeColors = {
  /** `surface.sunken`, but `black` in dark: its `#0D0D0D` is no Palette shade. */
  sunken: { light: 'neutral-100', dark: 'black' },
  /** `surface.raised`. */
  raised: { light: 'white', dark: 'neutral-800' },
  /** `primary.subtle`. */
  primarySubtle: { light: 'primary-100', dark: 'primary-900' },
  /** `primary.solid`. */
  primarySolid: { light: 'primary-600', dark: 'primary-300' },
  /** `primary.contrast`, for text on `primarySolid`. */
  primaryContrast: { light: 'white', dark: 'neutral-900' },
  /** `danger.foreground`, but `danger-600` in light, as before dark mode. */
  danger: { light: 'danger-600', dark: 'danger-300' },
  /** `warning.foreground`. */
  warning: { light: 'warning-800', dark: 'warning-400' },
  /** `success.foreground`. */
  success: { light: 'success-800', dark: 'success-400' },
  /** `text.muted`, for an Icon beside muted text. */
  textMuted: { light: 'neutral-700', dark: 'neutral-400' },
} satisfies Record<string, ModeColor>;
