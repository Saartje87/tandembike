'use client';

import { Stack, Text, Tooltip } from '@blockle/blocks';
import type { FC, ReactNode } from 'react';

import type { Footprint } from '../../footprint/footprint';
import {
  formatComparisons,
  formatFootprint,
} from '../../footprint/format-footprint';
import * as styles from './footprint-text.css';

/**
 * `content` as Tooltip's type takes it. Tooltip renders any node, but its
 * props intersect `content: ReactNode` with the HTML `content` attribute,
 * which narrows it to a string (T1088).
 */
const tooltipContent = (content: ReactNode) => content as string;

export type FootprintTextProps = {
  footprint: Footprint;
  /** Shown before the Footprint, outside its hint, such as "Cycle:". */
  label?: string;
  /** The tooltip's first line, saying what the Footprint counts. */
  scope?: string;
};

/**
 * A Footprint in muted small text, marked as an estimate (ADR 0050). A dotted
 * underline hints at its tooltip, which opens on hover or keyboard focus and
 * lists the five everyday comparisons, after an optional scope line. Without
 * recorded tokens it says not measured, with no hint and no tooltip. The one
 * way a Footprint is shown, so the hint, tooltip and rounding cannot drift.
 */
export const FootprintText: FC<FootprintTextProps> = ({
  footprint,
  label,
  scope,
}) => {
  const prefix = label ? `${label} ` : '';
  if (!footprint.measured) {
    return (
      <Text fontSize="small" color="muted" whiteSpace="nowrap">
        {`${prefix}Footprint not measured`}
      </Text>
    );
  }
  return (
    <Text fontSize="small" color="muted" whiteSpace="nowrap">
      {prefix}
      <Tooltip
        content={tooltipContent(
          <Stack gap={1}>
            {scope && <Text>{scope}</Text>}
            {formatComparisons(footprint.comparisons).map((line) => (
              <Text key={line} data-comparison>
                {line}
              </Text>
            ))}
          </Stack>,
        )}
      >
        <Text textDecoration="underline" className={styles.hint} tabIndex={0}>
          {formatFootprint(footprint)}
        </Text>
      </Tooltip>
    </Text>
  );
};
