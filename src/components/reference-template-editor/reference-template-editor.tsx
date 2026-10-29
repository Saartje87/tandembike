'use client';

import {
  Alert,
  Box,
  Button,
  Inline,
  Label,
  Stack,
  Text,
  TextInput,
} from '@blockle/blocks';
import { type FC, useId, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import type { ActionResult } from '../../app/lib/action-result';
import {
  addReferenceTemplate,
  removeReferenceTemplate,
  updateReferenceTemplate,
} from '../../app/projects/actions';
import type {
  ReferenceTemplate,
  ReferenceTemplateInput,
} from '../../tickets/reference-templates';
import { FieldError } from '../field-error/field-error';
import { Icon } from '../icon/icon';
import * as styles from './reference-template-editor.css';

export type ReferenceTemplateEditorProps = {
  projectId: number;
  /** The Project's Reference templates, in the order they were added. */
  templates: ReferenceTemplate[];
};

type TemplateFormProps = {
  /** The form's accessible name. */
  label: string;
  defaultValues: ReferenceTemplateInput;
  submitLabel: string;
  onSubmit: (values: ReferenceTemplateInput) => Promise<ActionResult>;
  /** Called once the Server Action has saved the values. */
  onSaved: () => void;
  /** Shows a Cancel button that calls it. */
  onCancel?: () => void;
};

/**
 * A prefix and URL field with a submit button. A refusal shows under the
 * field it names, or above the button when it names none, and keeps the
 * draft.
 */
const TemplateForm: FC<TemplateFormProps> = ({
  label,
  defaultValues,
  submitLabel,
  onSubmit,
  onSaved,
  onCancel,
}) => {
  const prefixId = useId();
  const prefixErrorId = useId();
  const urlId = useId();
  const urlErrorId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<ReferenceTemplateInput>({ defaultValues });
  const prefixError = errors.prefix?.message;
  const urlError = errors.url?.message;
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async (values) => {
    const result = await onSubmit(values);
    if (result.ok) {
      onSaved();
      return;
    }
    const { prefix, url } = result.fieldErrors ?? {};
    if (prefix) {
      setError('prefix', { type: 'server', message: prefix });
    }
    if (url) {
      setError('url', { type: 'server', message: url });
    }
    if (!prefix && !url) {
      setError('root.server', { message: result.error });
    }
  });

  return (
    <form aria-label={label} onSubmit={submit}>
      <Stack gap={2}>
        <Inline gap={2} alignItems="flex-start">
          <Stack gap={1} className={styles.prefixField}>
            <Label htmlFor={prefixId}>Prefix</Label>
            <TextInput
              {...register('prefix')}
              id={prefixId}
              placeholder="#"
              autoComplete="off"
              aria-invalid={prefixError ? true : undefined}
              aria-describedby={prefixError ? prefixErrorId : undefined}
            />
            <FieldError id={prefixErrorId} reason={prefixError} />
          </Stack>
          <Stack gap={1} className={styles.urlField}>
            <Label htmlFor={urlId}>URL</Label>
            <TextInput
              {...register('url')}
              id={urlId}
              placeholder="https://github.com/owner/repo/issues/{n}"
              autoComplete="off"
              aria-invalid={urlError ? true : undefined}
              aria-describedby={urlError ? urlErrorId : undefined}
            />
            <FieldError id={urlErrorId} reason={urlError} />
          </Stack>
        </Inline>
        {serverError && <Alert intent="danger">{serverError}</Alert>}
        <Inline gap={2}>
          <Button type="submit" size="small" loading={isSubmitting}>
            {submitLabel}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="small"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
        </Inline>
      </Stack>
    </form>
  );
};

/**
 * A Project's Reference templates, each with buttons to edit it in place or
 * remove it, then a form that adds another. Each change shows once the
 * Server Action has saved it and the page refreshes.
 */
export const ReferenceTemplateEditor: FC<ReferenceTemplateEditorProps> = ({
  projectId,
  templates,
}) => {
  const [editing, setEditing] = useState<number>();
  const [removeError, setRemoveError] = useState<string>();
  const [, startRemove] = useTransition();
  // A new key remounts the add form empty after each addition.
  const [added, setAdded] = useState(0);

  const remove = (id: number) => {
    setRemoveError(undefined);
    startRemove(async () => {
      const result = await removeReferenceTemplate({ id });
      if (!result.ok) {
        setRemoveError(result.error);
      }
    });
  };

  return (
    <Stack gap={4}>
      {templates.length > 0 ? (
        <Stack
          tag="ul"
          gap={2}
          aria-label="Reference templates"
          className={styles.list}
        >
          {templates.map((template) => (
            <li key={template.id}>
              {editing === template.id ? (
                <TemplateForm
                  label={`Edit Reference template ${template.prefix}`}
                  defaultValues={{ prefix: template.prefix, url: template.url }}
                  submitLabel="Save"
                  onSubmit={(values) =>
                    updateReferenceTemplate({ id: template.id, ...values })
                  }
                  onSaved={() => setEditing(undefined)}
                  onCancel={() => setEditing(undefined)}
                />
              ) : (
                <Inline gap={2} alignY="center" flexWrap="nowrap">
                  <Text tag="code" fontFamily="mono">
                    {template.prefix}
                  </Text>
                  <Icon name="arrow-long-right" size="small" />
                  <Box flexGrow={1}>
                    <Text fontSize="small" wordBreak="break-word">
                      {template.url}
                    </Text>
                  </Box>
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    aria-label={`Edit Reference template ${template.prefix}`}
                    onClick={() => setEditing(template.id)}
                  >
                    <Icon name="pencil" size="small" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    aria-label={`Remove Reference template ${template.prefix}`}
                    onClick={() => remove(template.id)}
                  >
                    <Icon name="x-mark" size="small" />
                  </Button>
                </Inline>
              )}
            </li>
          ))}
        </Stack>
      ) : (
        <Text tag="p" fontSize="small" color="muted">
          No Reference templates yet.
        </Text>
      )}
      {removeError && <Alert intent="danger">{removeError}</Alert>}
      <TemplateForm
        key={added}
        label="Add a Reference template"
        defaultValues={{ prefix: '', url: '' }}
        submitLabel="Add"
        onSubmit={(values) => addReferenceTemplate({ projectId, ...values })}
        onSaved={() => setAdded((count) => count + 1)}
      />
    </Stack>
  );
};
