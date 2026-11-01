'use client';

import { Alert, Button, Label, Stack, Textarea } from '@blockle/blocks';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

import { setProjectSkills } from '../../app/projects/actions';
import { FieldError } from '../field-error/field-error';

export type SkillsFormProps = {
  projectId: number;
  /** The Project's saved Skills, in order. */
  skills: string[];
};

/**
 * A Project's Skills, one command per line, offered as chips in its
 * Conversations (T620). Save shows the lines as stored; a refusal shows
 * under the field and keeps the text.
 */
export const SkillsForm: FC<SkillsFormProps> = ({ projectId, skills }) => {
  const fieldId = useId();
  const errorId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<{ text: string }>({
    defaultValues: { text: skills.join('\n') },
  });
  const fieldError = errors.text?.message;
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async ({ text }) => {
    const result = await setProjectSkills({ projectId, text });
    if (result.ok) {
      reset({ text: result.skills.join('\n') });
    } else if (result.fieldErrors?.skills) {
      setError('text', { type: 'server', message: result.fieldErrors.skills });
    } else {
      setError('root.server', { message: result.error });
    }
  });

  return (
    <form aria-label="Skills" onSubmit={submit}>
      <Stack gap={3}>
        <Stack gap={1}>
          <Label htmlFor={fieldId}>Skills</Label>
          <Textarea
            {...register('text')}
            id={fieldId}
            rows={6}
            placeholder="/mattpocock-skills:grilling"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
          />
          <FieldError id={errorId} reason={fieldError} />
        </Stack>
        {serverError && <Alert intent="danger">{serverError}</Alert>}
        <div>
          <Button type="submit" size="small" loading={isSubmitting}>
            Save
          </Button>
        </div>
      </Stack>
    </form>
  );
};
