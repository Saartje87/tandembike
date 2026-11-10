'use client';

import { Inline, Label, Stack, Switch, Text } from '@blockle/blocks';
import {
  type ChangeEvent,
  type FC,
  startTransition,
  useId,
  useOptimistic,
} from 'react';
import { useForm } from 'react-hook-form';

import { fieldRefusal, rootRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { setProjectAgentSettings } from '../../app/projects/actions';
import { AppLink } from '../app-link/app-link';
import { FieldError } from '../field-error/field-error';

const switches = {
  autopilot: {
    label: 'Autopilot',
    ceilingField: 'spendCeilingUsd',
    setCeiling: 'Set a Spend ceiling',
  },
  autoTriage: {
    label: 'Auto-triage',
    ceilingField: 'triageCeilingUsd',
    setCeiling: 'Set a Triage ceiling',
  },
} as const;

export type ProjectSwitchProps = {
  projectId: number;
  /** Which Project switch: Autopilot, or Auto-triage. */
  setting: keyof typeof switches;
  /** Whether it is on. */
  checked: boolean;
  /**
   * Where its ceiling is set. When given and the ceiling is not set, the
   * switch is off and disabled, and links there with "Set a … ceiling".
   */
  ceiling?: { usd: number | null; settingsHref: string };
};

/**
 * Autopilot's or Auto-triage's switch, saving at once through the settings
 * page's Server Action, so a refusal reads the same everywhere. The
 * optimistic value is its pending state, and a refusal puts it back and
 * shows why (AGENTS.md, Forms).
 */
export const ProjectSwitch: FC<ProjectSwitchProps> = ({
  projectId,
  setting,
  checked,
  ceiling,
}) => {
  const { label, ceilingField, setCeiling } = switches[setting];
  const switchId = useId();
  const errorId = useId();
  const reasonId = useId();
  const {
    clearErrors,
    formState: { errors },
    setError,
  } = useForm<{ on: boolean }>({ defaultValues: { on: checked } });
  const error = errors.on?.message;
  const [shown, show] = useOptimistic(
    checked,
    (_current, next: boolean) => next,
  );
  const needsCeiling =
    ceiling !== undefined && ceiling.usd === null && !checked;

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.checked;
    clearErrors();
    startTransition(async () => {
      show(next);
      const result = await callAction(
        () => setProjectAgentSettings({ projectId, [setting]: next }),
        'The setting could not be saved. Try again.',
      );
      // A refusal puts the switch back when the transition ends.
      const reason = fieldRefusal(result, ceilingField) ?? rootRefusal(result);
      if (reason) {
        setError('on', { type: 'server', message: reason });
      }
    });
  };

  return (
    <Stack gap={1}>
      <Inline gap={2} alignY="center">
        <Switch
          id={switchId}
          checked={shown}
          onChange={change}
          disabled={needsCeiling}
          aria-describedby={
            needsCeiling ? reasonId : error ? errorId : undefined
          }
        />
        <Label htmlFor={switchId}>{label}</Label>
        {needsCeiling && (
          <Text id={reasonId} fontSize="small">
            <AppLink href={ceiling.settingsHref}>{setCeiling}</AppLink>
          </Text>
        )}
      </Inline>
      <FieldError id={errorId} reason={error} />
    </Stack>
  );
};
