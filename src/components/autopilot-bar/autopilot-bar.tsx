'use client';

import { Inline, Label, Stack, Switch, Tag, Text } from '@blockle/blocks';
import {
  type ChangeEvent,
  type FC,
  startTransition,
  useId,
  useOptimistic,
} from 'react';
import { useForm } from 'react-hook-form';

import { refusalReason } from '../../app/lib/action-result';
import { formatCost } from '../../app/lib/format-cost';
import { setProjectAgentSettings } from '../../app/projects/actions';
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
  // The switch saves at once, so the optimistic value is its pending state and
  // a refusal shows through the form's errors (AGENTS.md, Forms).
  const {
    clearErrors,
    formState: { errors },
    setError,
  } = useForm<{ autopilot: boolean }>({ defaultValues: { autopilot } });
  const error = errors.autopilot?.message;
  const [shown, showAutopilot] = useOptimistic(
    autopilot,
    (_current, next: boolean) => next,
  );
  const paused =
    autopilot && spendCeilingUsd !== null && spendUsd >= spendCeilingUsd;

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.checked;
    clearErrors();
    startTransition(async () => {
      showAutopilot(next);
      const result = await setProjectAgentSettings({
        projectId,
        autopilot: next,
      });
      // A refusal puts the switch back when the transition ends.
      const reason = refusalReason(result, 'spendCeilingUsd');
      if (reason) {
        setError('autopilot', { type: 'server', message: reason });
      }
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
