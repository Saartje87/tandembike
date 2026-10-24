'use client';

import {
  Alert,
  Button,
  Heading,
  Inline,
  Label,
  Stack,
  TextInput,
  VisuallyHidden,
} from '@blockle/blocks';
import { type FC, useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { renameProject } from '../../app/projects/actions';
import type { Project } from '../../tickets/tickets';

export type RenameProjectInlineEditProps = {
  project: Project;
};

/**
 * An inline Project name editor. On success, the Server Action revalidates the
 * layout so the Board header and side navigation show the new name.
 */
export const RenameProjectInlineEdit: FC<RenameProjectInlineEditProps> = ({
  project,
}) => {
  const inputId = useId();
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ name: string }>({
    defaultValues: { name: project.name },
  });

  const beginEditing = () => {
    reset({ name: project.name });
    setEditing(true);
  };
  const cancel = () => {
    if (!isSubmitting) {
      setEditing(false);
    }
  };

  const submit = handleSubmit(async ({ name }) => {
    const result = await renameProject({ projectId: project.id, name });
    if (!result.ok) {
      setError('name', { type: 'server', message: result.error });
      return;
    }
    setEditing(false);
  });

  return (
    <Stack gap={1}>
      {editing ? (
        <form
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
        >
          <Stack gap={1}>
            <Inline gap={2} alignY="center">
              <Label htmlFor={inputId}>
                <VisuallyHidden>Project name</VisuallyHidden>
              </Label>
              <TextInput
                {...register('name')}
                id={inputId}
                autoComplete="off"
                autoFocus
                disabled={isSubmitting}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? errorId : undefined}
              />
              <Button type="submit" loading={isSubmitting}>
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={cancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </Inline>
            {errors.name?.message && (
              <Alert id={errorId} intent="error">
                {errors.name.message}
              </Alert>
            )}
          </Stack>
        </form>
      ) : (
        <Inline gap={2} alignY="center">
          <Heading level={1}>{project.name}</Heading>
          <Button variant="ghost" size="small" onClick={beginEditing}>
            Rename
          </Button>
        </Inline>
      )}
    </Stack>
  );
};
