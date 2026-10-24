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

import { discardCycle, renameCycle } from '../../app/cycles/actions';
import { projectPath } from '../../app/lib/paths';
import type { Cycle } from '../../tickets/cycles';
import { FieldError } from '../field-error/field-error';

export type CycleHeaderProps = {
  cycle: Cycle;
};

type CycleTitleProps = {
  cycle: Cycle;
};

/** The Cycle's title as a heading, with a Rename button that edits it inline. */
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
 * The head of a Cycle's tab: its title, editable in place, its state, and
 * Discard Cycle for a Prepared one, which goes back to the Backlog.
 */
export const CycleHeader: FC<CycleHeaderProps> = ({ cycle }) => {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const discard = () => {
    if (
      !window.confirm(
        `Discard the Cycle "${cycle.title}"? Its Tickets go back to the Backlog.`,
      )
    ) {
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await discardCycle({ cycleId: cycle.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(projectPath(cycle.projectId));
    });
  };

  return (
    <Stack gap={2}>
      <Inline gap={3} alignY="center" justifyContent="space-between">
        <Inline gap={2} alignY="center">
          <CycleTitle key={cycle.title} cycle={cycle} />
          <Text fontSize="small" color="text-600">
            {cycle.state}
          </Text>
        </Inline>
        {cycle.state === 'Prepared' && (
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
        )}
      </Inline>
      {error && <Alert intent="error">{error}</Alert>}
    </Stack>
  );
};
