'use client';

import { Alert, Button, Label, Stack, TextInput } from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

import { projectPath } from '../../app/lib/paths';
import { createProject } from '../../app/projects/actions';

export type NewProjectFormProps = {
  /** Called after the Project is created, before navigating to its Board. */
  onCreated?: () => void;
};

export const NewProjectForm: FC<NewProjectFormProps> = ({ onCreated }) => {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<{ name: string }>({ defaultValues: { name: '' } });
  const error = errors.root?.server?.message;

  const submit = handleSubmit(async ({ name }) => {
    const result = await createProject({ name });
    if (!result.ok) {
      setError('root.server', { message: result.error });
      return;
    }
    onCreated?.();
    router.push(projectPath(result.projectId));
  });

  // While the Project saves, a second submit is ignored, so it is created once.
  return (
    <form
      onSubmit={(event) => {
        if (isSubmitting) {
          event.preventDefault();
          return;
        }
        submit(event);
      }}
    >
      <Stack gap={3}>
        <Stack gap={1}>
          <Label htmlFor={inputId}>Project name</Label>
          <TextInput
            {...register('name')}
            id={inputId}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </Stack>
        {error && (
          <Alert id={errorId} intent="error">
            {error}
          </Alert>
        )}
        <Button type="submit" alignSelf="flex-start" loading={isSubmitting}>
          Create Project
        </Button>
      </Stack>
    </form>
  );
};
