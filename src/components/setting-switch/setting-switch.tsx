'use client';

import { Inline, Label, Stack, Switch, Text } from '@blockle/blocks';
import {
  type ChangeEvent,
  type FC,
  type ReactNode,
  startTransition,
  useEffect,
  useId,
  useOptimistic,
  useState,
} from 'react';
import { useForm } from 'react-hook-form';

import { fieldRefusal, rootRefusal } from '../../app/lib/action-result';
import { callAction } from '../../app/lib/call-action';
import { setProjectAgentSettings } from '../../app/projects/actions';
import { FieldError } from '../field-error/field-error';

/** The Project agent settings a Settings switch saves. */
export type SwitchSetting =
  | 'parallelRuns'
  | 'agentMode'
  | 'autopilot'
  | 'autoMerge'
  | 'autoTriage';

export type SettingSwitchProps = {
  projectId: number;
  setting: SwitchSetting;
  label: string;
  /** One line under the switch, describing it. */
  hint?: ReactNode;
  /** Whether it is on, as saved, or as its section holds it. */
  checked: boolean;
  disabled?: boolean;
  /** Called once a change is saved, with the new value. */
  onSaved?: (on: boolean) => void;
  /**
   * Called before saving a change; returning `true` leaves the change to
   * the section, which holds it as an unsaved edit instead.
   */
  hold?: (on: boolean) => boolean;
  /** What hangs off the switch, such as its ceilings or the Setup offer. */
  children?: ReactNode;
};

/** How long "Saved" shows after a save. */
const savedFor = 1500;

/**
 * One switch of a Project's Settings, saving only its own setting at once
 * (ADR 0053): the optimistic value is its pending state, a brief "Saved"
 * confirms it, and a refusal puts it back and shows why under it, whichever
 * field the reason names (AGENTS.md, Forms).
 */
export const SettingSwitch: FC<SettingSwitchProps> = ({
  projectId,
  setting,
  label,
  hint,
  checked,
  disabled,
  onSaved,
  hold,
  children,
}) => {
  const switchId = useId();
  const hintId = useId();
  const errorId = useId();
  const {
    clearErrors,
    formState: { errors },
    setError,
  } = useForm<{ on: boolean }>({ defaultValues: { on: checked } });
  const error = errors.on?.message;
  // What was saved here, until the page's refresh brings the same.
  const [saved, setSaved] = useState(checked);
  const [given, setGiven] = useState(checked);
  if (given !== checked) {
    setGiven(checked);
    setSaved(checked);
  }
  const [shown, show] = useOptimistic(saved, (_current, next: boolean) => next);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!flash) {
      return;
    }
    const timer = setTimeout(() => setFlash(false), savedFor);
    return () => clearTimeout(timer);
  }, [flash]);

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.checked;
    clearErrors();
    setFlash(false);
    if (hold?.(next)) {
      return;
    }
    startTransition(async () => {
      show(next);
      const result = await callAction(
        () => setProjectAgentSettings({ projectId, [setting]: next }),
        'The setting could not be saved. Try again.',
      );
      if (result.ok) {
        startTransition(() => setSaved(next));
        setFlash(true);
        onSaved?.(next);
        return;
      }
      // A refusal puts the switch back when the transition ends.
      const reason =
        fieldRefusal(result, setting) ??
        Object.values(result.fieldErrors ?? {}).find(Boolean) ??
        rootRefusal(result);
      setError('on', { type: 'server', message: reason });
    });
  };

  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <Stack gap={2}>
      <Stack gap={1}>
        <Inline gap={2} alignY="center">
          <Switch
            id={switchId}
            checked={shown}
            disabled={disabled}
            onChange={change}
            aria-describedby={describedBy || undefined}
          />
          <Label htmlFor={switchId}>{label}</Label>
          {flash && (
            <Text tag="span" fontSize="small" color="muted" role="status">
              Saved
            </Text>
          )}
        </Inline>
        {hint && (
          <Text id={hintId} tag="p" fontSize="small" color="muted">
            {hint}
          </Text>
        )}
        <FieldError id={errorId} reason={error} />
      </Stack>
      {children}
    </Stack>
  );
};
