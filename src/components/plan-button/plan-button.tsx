'use client';

import {
  Alert,
  Button,
  Inline,
  Label,
  Stack,
  TextInput,
} from '@blockle/blocks';
import { type FC, useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { startPlan } from '../../app/conversations/actions';
import { callAction } from '../../app/lib/call-action';
import type { AgentKind } from '../../tickets/agent-kind';
import { AgentPicker } from '../agent-picker/agent-picker';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { FieldError } from '../field-error/field-error';

export type PlanButtonProps = {
  projectId: number;
};

/**
 * Plan (T1248): a button that asks for a goal and starts a Plan Conversation
 * on it, which proposes a Prepared Cycle from the Backlog. The Conversation
 * opens in the Conversation dialog. A refusal shows under the goal.
 */
export const PlanButton: FC<PlanButtonProps> = ({ projectId }) => {
  const dialog = useConversationDialog();
  const goalId = useId();
  const errorId = useId();
  const [asking, setAsking] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<{ goal: string; agentKind?: AgentKind }>({
    defaultValues: { goal: '' },
  });
  const goalReason = errors.goal?.message;
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async ({ goal, agentKind }) => {
    const result = await callAction(
      () =>
        startPlan({
          projectId,
          goal,
          ...(agentKind === undefined ? {} : { agentKind }),
        }),
      'The Plan could not be started. Try again.',
    );
    if (!result.ok) {
      const reason = result.fieldErrors?.goal;
      if (reason) {
        setError('goal', { type: 'server', message: reason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    reset();
    setAsking(false);
    dialog.open(result.conversation.id);
  });

  if (!asking) {
    return (
      <div>
        <Button type="button" size="small" onClick={() => setAsking(true)}>
          Plan
        </Button>
      </div>
    );
  }

  return (
    <form aria-label="Plan" onSubmit={submit}>
      <Stack gap={2}>
        <Label htmlFor={goalId}>Goal</Label>
        <TextInput
          {...register('goal')}
          id={goalId}
          autoComplete="off"
          autoFocus
          placeholder="What should the next Cycle achieve?"
          readOnly={isSubmitting}
          aria-invalid={goalReason ? true : undefined}
          aria-describedby={goalReason ? errorId : undefined}
        />
        <FieldError id={errorId} reason={goalReason} />
        <AgentPicker
          scope={{ projectId }}
          value={watch('agentKind')}
          onChange={(kind) => setValue('agentKind', kind)}
        />
        {serverError && <Alert intent="danger">{serverError}</Alert>}
        <Inline gap={2}>
          <Button type="submit" size="small" loading={isSubmitting}>
            Start planning
          </Button>
          <Button
            type="button"
            size="small"
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => {
              reset();
              setAsking(false);
            }}
          >
            Cancel
          </Button>
        </Inline>
      </Stack>
    </form>
  );
};
