'use client';

import {
  Alert,
  Button,
  Heading,
  Inline,
  Label,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import { type FC, useId, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import {
  archiveCycle,
  discardCycle,
  renameCycle,
  startCycle,
} from '../../app/cycles/actions';
import type { ActionResult } from '../../app/lib/action-result';
import { projectPath } from '../../app/lib/paths';
import type { Cycle } from '../../tickets/cycles';
import { DateTime } from '../date-time/date-time';
import { FieldError } from '../field-error/field-error';

export type CycleHeaderProps = {
  cycle: Cycle;
};

type CycleTitleProps = {
  cycle: Cycle;
};

/**
 * The Cycle's title as a heading, with a Rename button that edits it
 * inline unless the Cycle is Archived.
 */
const CycleTitle: FC<CycleTitleProps> = ({ cycle }) => {
  const inputId = useId();
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ title: string }>({ defaultValues: { title: cycle.title } });
  const reason = errors.title?.message ?? errors.root?.server?.message;

  const submit = handleSubmit(async ({ title }) => {
    const result = await renameCycle({ cycleId: cycle.id, title });
    if (!result.ok) {
      const titleReason = result.fieldErrors?.title;
      if (titleReason) {
        setError('title', { type: 'server', message: titleReason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    setEditing(false);
  });

  if (cycle.state === 'Archived') {
    return <Heading level={2}>{cycle.title}</Heading>;
  }
  if (!editing) {
    return (
      <Inline gap={2} alignY="center">
        <Heading level={2}>{cycle.title}</Heading>
        <Button
          type="button"
          variant="ghost"
          size="small"
          onClick={() => {
            reset({ title: cycle.title });
            setEditing(true);
          }}
        >
          Rename
        </Button>
      </Inline>
    );
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isSubmitting) {
          event.preventDefault();
          setEditing(false);
        }
      }}
    >
      <Stack gap={1}>
        <Inline gap={2} alignY="center">
          <Label htmlFor={inputId}>
            <VisuallyHidden>Cycle title</VisuallyHidden>
          </Label>
          <TextInput
            {...register('title')}
            id={inputId}
            autoComplete="off"
            autoFocus
            readOnly={isSubmitting}
            aria-invalid={reason ? true : undefined}
            aria-describedby={reason ? errorId : undefined}
          />
          <Button type="submit" size="small" loading={isSubmitting}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="small"
            disabled={isSubmitting}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </Inline>
        <FieldError id={errorId} reason={reason} />
      </Stack>
    </form>
  );
};

/**
 * The head of a Cycle's page: its title, editable in place, and its state.
 * A Prepared Cycle can be started or discarded, an Active one archived
 * (both go back to the Backlog), and an Archived one is read-only.
 */
export const CycleHeader: FC<CycleHeaderProps> = ({ cycle }) => {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  /** Runs a Cycle action, showing its refusal, then `onDone` if it succeeded. */
  const run = (
    action: (input: { cycleId: number }) => Promise<ActionResult>,
    onDone?: () => void,
  ) => {
    setError(undefined);
    startTransition(async () => {
      const result = await action({ cycleId: cycle.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone?.();
    });
  };

  const archive = () => {
    if (
      window.confirm(
        `Archive the Cycle "${cycle.title}"? Its unfinished Tickets go back to the Backlog.`,
      )
    ) {
      run(archiveCycle, () => router.push(projectPath(cycle.projectId)));
    }
  };

  const discard = () => {
    if (
      window.confirm(
        `Discard the Cycle "${cycle.title}"? Its Tickets go back to the Backlog.`,
      )
    ) {
      run(discardCycle, () => router.push(projectPath(cycle.projectId)));
    }
  };

  return (
    <Stack gap={2}>
      <Inline gap={3} alignY="center" justifyContent="space-between">
        <Inline gap={2} alignY="center">
          <CycleTitle key={cycle.title} cycle={cycle} />
          <Text fontSize="small" color="text-600">
            {cycle.state === 'Archived' && cycle.archivedAt ? (
              <>
                Archived <DateTime date={cycle.archivedAt} />
              </>
            ) : (
              cycle.state
            )}
          </Text>
        </Inline>
        {cycle.state === 'Prepared' && (
          <Inline gap={2} alignY="center">
            <Button
              type="button"
              variant="outline"
              intent="neutral"
              size="small"
              disabled={pending}
              onClick={discard}
            >
              Discard Cycle
            </Button>
            <Button
              type="button"
              size="small"
              disabled={pending}
              onClick={() => run(startCycle)}
            >
              Start Cycle
            </Button>
          </Inline>
        )}
        {cycle.state === 'Active' && (
          <Button
            type="button"
            variant="outline"
            intent="neutral"
            size="small"
            disabled={pending}
            onClick={archive}
          >
            Archive Cycle
          </Button>
        )}
      </Inline>
      {error && <Alert intent="error">{error}</Alert>}
    </Stack>
  );
};
