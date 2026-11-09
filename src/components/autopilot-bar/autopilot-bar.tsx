import { Inline, Tag, Text } from '@blockle/blocks';
import type { FC } from 'react';

import { formatCost } from '../../app/lib/format-cost';
import { ProjectSwitch } from '../project-switch/project-switch';

export type AutopilotBarProps = {
  projectId: number;
  /** Whether the Project's Autopilot switch is on. */
  autopilot: boolean;
  /** The Project's Spend ceiling in USD, or null without one. */
  spendCeilingUsd: number | null;
  /** What Autopilot has spent on the Active Cycle in USD. */
  spendUsd: number;
};

/**
 * Autopilot's controls on the Active Cycle's Board header (GLOSSARY: Spend
 * ceiling): the switch, which is the setting on the settings page and on
 * Flow, the Cycle's Autopilot spend against the ceiling, and "paused: over
 * ceiling" while the spend has reached it with the switch on. The Board
 * refreshes on every change, so the spend is live.
 */
export const AutopilotBar: FC<AutopilotBarProps> = ({
  projectId,
  autopilot,
  spendCeilingUsd,
  spendUsd,
}) => {
  const paused =
    autopilot && spendCeilingUsd !== null && spendUsd >= spendCeilingUsd;
  return (
    <Inline gap={3} alignY="start">
      <ProjectSwitch
        projectId={projectId}
        setting="autopilot"
        checked={autopilot}
      />
      <Text color="muted" fontSize="small">
        {spendCeilingUsd === null
          ? `${formatCost(spendUsd)}, no ceiling`
          : `${formatCost(spendUsd)} of ${formatCost(spendCeilingUsd)}`}
      </Text>
      {paused && (
        <Tag intent="warning">
          {`paused: over ceiling (${formatCost(spendUsd)})`}
        </Tag>
      )}
    </Inline>
  );
};
