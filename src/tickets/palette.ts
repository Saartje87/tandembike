/**
 * The fixed, named colours a Project or an Epic can have. The UI themes each
 * for light and dark mode; the Tickets module only knows the names.
 */
export const paletteColors = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
  'grey',
] as const;

export type PaletteColor = (typeof paletteColors)[number];

/** Whether `value` is one of the palette's colours, for input from outside. */
export function isPaletteColor(value: unknown): value is PaletteColor {
  return (paletteColors as readonly unknown[]).includes(value);
}

/** The reason given for a colour outside the palette. */
export const paletteRule = `Choose one of these colours: ${paletteColors.join(', ')}.`;
