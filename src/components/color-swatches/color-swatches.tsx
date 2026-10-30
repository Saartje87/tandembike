'use client';

import { Box, Button, Text } from '@blockle/blocks';
import type { FC } from 'react';

import { modeColors } from '../../app/lib/mode-colors';
import { type PaletteColor, paletteColors } from '../../tickets/palette';
import { Icon } from '../icon/icon';
import { tinted } from '../palette/palette.css';
import * as styles from './color-swatches.css';

export type ColorSwatchesProps = {
  /** The colour picked now, or `null` for none. */
  value: PaletteColor | null;
  onPick: (color: PaletteColor | null) => void;
  /** Offer Default first, which picks no colour. Defaults to false. */
  withDefault?: boolean;
  disabled?: boolean;
};

type SwatchProps = { color: PaletteColor };

/** A colour as a round tint ringed in its strong shade. Decorative. */
export const Swatch: FC<SwatchProps> = ({ color }) => (
  <Box borderRadius="full" className={`${styles.swatch} ${tinted[color]}`} />
);

/** `teal` as `Teal`, for a swatch's name. */
export function colorName(color: PaletteColor): string {
  return color[0].toUpperCase() + color.slice(1);
}

/**
 * The palette as a fieldset of swatch buttons named `Colour`, the picked one
 * pressed: each colour's tint with its strong shade as a dot, and with
 * `withDefault`, a Default swatch first.
 */
export const ColorSwatches: FC<ColorSwatchesProps> = ({
  value,
  onPick,
  withDefault = false,
  disabled,
}) => (
  <Box asChild border="none" padding={0} margin={0}>
    <fieldset>
      <Text asChild fontSize="small" fontWeight="strong">
        <legend>Colour</legend>
      </Text>
      <Box marginBlockStart={2} display="flex" flexWrap="wrap" gap={1}>
        {withDefault && (
          <Button
            type="button"
            variant="ghost"
            size="small"
            aria-label="Default"
            aria-pressed={value === null}
            disabled={disabled}
            onClick={() => onPick(null)}
          >
            <Icon name="no-symbol" size="small" color={modeColors.textMuted} />
          </Button>
        )}
        {paletteColors.map((color) => (
          <Button
            key={color}
            type="button"
            variant="ghost"
            size="small"
            aria-label={colorName(color)}
            aria-pressed={value === color}
            disabled={disabled}
            onClick={() => onPick(color)}
          >
            <Box
              borderRadius="full"
              className={`${styles.swatch} ${tinted[color]}`}
            />
          </Button>
        ))}
      </Box>
    </fieldset>
  </Box>
);
