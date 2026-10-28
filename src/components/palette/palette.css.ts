import {
  assignVars,
  createGlobalTheme,
  createThemeContract,
  globalStyle,
  styleVariants,
} from '@vanilla-extract/css';

import { type PaletteColor, paletteColors } from '../../tickets/palette';

type Shades = { tint: string; strong: string };

/**
 * Each palette colour as two tokens: `tint`, a soft background, and
 * `strong`, for an icon or text on that tint or on the page. Blocks has no
 * decorative palette (T317), so the values live here.
 */
export const palette = createThemeContract(
  Object.fromEntries(
    paletteColors.map((color) => [color, { tint: null, strong: null }]),
  ) as Record<PaletteColor, Record<keyof Shades, null>>,
);

const light: Record<PaletteColor, Shades> = {
  red: { tint: '#FEE2E2', strong: '#B91C1C' },
  orange: { tint: '#FFEDD5', strong: '#C2410C' },
  amber: { tint: '#FEF3C7', strong: '#B45309' },
  green: { tint: '#DCFCE7', strong: '#15803D' },
  teal: { tint: '#CCFBF1', strong: '#0F766E' },
  blue: { tint: '#DBEAFE', strong: '#1D4ED8' },
  indigo: { tint: '#E0E7FF', strong: '#4338CA' },
  purple: { tint: '#F3E8FF', strong: '#7E22CE' },
  pink: { tint: '#FCE7F3', strong: '#BE185D' },
  grey: { tint: '#F3F4F6', strong: '#4B5563' },
};

const dark: Record<PaletteColor, Shades> = {
  red: { tint: '#450A0A', strong: '#FCA5A5' },
  orange: { tint: '#431407', strong: '#FDBA74' },
  amber: { tint: '#451A03', strong: '#FCD34D' },
  green: { tint: '#052E16', strong: '#86EFAC' },
  teal: { tint: '#042F2E', strong: '#5EEAD4' },
  blue: { tint: '#172554', strong: '#93C5FD' },
  indigo: { tint: '#1E1B4B', strong: '#A5B4FC' },
  purple: { tint: '#3B0764', strong: '#D8B4FE' },
  pink: { tint: '#500724', strong: '#F9A8D4' },
  grey: { tint: '#1F2937', strong: '#D1D5DB' },
};

createGlobalTheme(':root', palette, light);

// The app's theme is light only, so the dark shades wait for a dark mode to
// set `data-color-scheme="dark"` on the root; following the system setting
// would put dark tints behind the light theme's dark text.
globalStyle(':root[data-color-scheme="dark"]', {
  vars: assignVars(palette, dark),
});

/** A palette colour's soft tint as the background. */
export const tintBackground = styleVariants(palette, ({ tint }) => ({
  backgroundColor: tint,
}));

/** A palette colour's strong shade as the text (and `currentColor`). */
export const strongColor = styleVariants(palette, ({ strong }) => ({
  color: strong,
}));

/** A palette colour's tint with its strong shade on it, for a badge. */
export const tinted = styleVariants(palette, ({ tint, strong }) => ({
  backgroundColor: tint,
  color: strong,
}));
