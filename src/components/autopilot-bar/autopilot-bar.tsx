'use client';

import { Inline, Label, Stack, Switch, Tag, Text } from '@blockle/blocks';
import {
  type ChangeEvent,
  type FC,
  startTransition,
  useId,
  useOptimistic,
  useState,
} from 'react';

import { refusalReason } from '../../app/lib/action-result';
import { setProjectAgentSettings } from '../../app/projects/actions';
import { formatCost } from '../conversation-labels/conversation-labels';
import { FieldError } from '../field-error/field-error';

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
 * ceiling): the switch, which is the setting on the settings page, the
 * Cycle's Autopilot spend against the ceiling, and "paused: over ceiling"
 * while the spend has reached it with the switch on. The Board refreshes on
 * every change, so the spend is live.
 */
export const AutopilotBar: FC<AutopilotBarProps> = ({
  projectId,
  autopilot,
  spendCeilingUsd,
  spendUsd,
}) => {
  const switchId = useId();
  const errorId = useId();
  const [error, setError] = useState<string>();
  const [shown, showAutopilot] = useOptimistic(
    autopilot,
    (_current, next: boolean) => next,
  );
  const paused =
    autopilot && spendCeilingUsd !== null && spendUsd >= spendCeilingUsd;

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.checked;
    setError(undefined);
    startTransition(async () => {
      showAutopilot(next);
      const result = await setProjectAgentSettings({
        projectId,
        autopilot: next,
      });
      // A refusal puts the switch back when the transition ends.
      setError(refusalReason(result, 'spendCeilingUsd'));
    });
  };

  return (
    <Stack gap={1}>
      <Inline gap={3} alignY="center">
        <Inline gap={2} alignY="center">
          <Switch
            id={switchId}
            checked={shown}
            onChange={change}
            aria-describedby={error ? errorId : undefined}
          />
          <Label htmlFor={switchId}>Autopilot</Label>
        </Inline>
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
      <FieldError id={errorId} reason={error} />
    </Stack>
  );
};
