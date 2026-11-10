'use client';

import { Text, Tooltip } from '@blockle/blocks';
import type { FC } from 'react';

import type { Footprint } from '../../footprint/footprint';
import {
  formatComparisons,
  formatFootprint,
} from '../../footprint/format-footprint';

export type FootprintTextProps = {
  footprint: Footprint;
};

/**
 * A Conversation's Footprint in muted small text, marked as an estimate,
 * with its everyday comparisons in a tooltip on hover or focus (ADR 0050).
 * Without recorded tokens it says so instead.
 */
export const FootprintText: FC<FootprintTextProps> = ({ footprint }) => {
  if (!footprint.measured) {
    return (
      <Text fontSize="small" color="muted" whiteSpace="nowrap">
        Footprint not measured
      </Text>
    );
  }
  return (
    <Tooltip content={formatComparisons(footprint)}>
      <Text fontSize="small" color="muted" whiteSpace="nowrap" tabIndex={0}>
        {formatFootprint(footprint)}
      </Text>
    </Tooltip>
  );
};
