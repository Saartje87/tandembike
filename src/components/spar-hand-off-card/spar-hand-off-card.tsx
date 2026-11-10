'use client';

import {
  Alert,
  Box,
  Button,
  Heading,
  Inline,
  Label,
  Radio,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@blockle/blocks';
import { type FC, useId } from 'react';
import { useForm } from 'react-hook-form';

import { callAction } from '../../app/lib/call-action';
import { modeColors } from '../../app/lib/mode-colors';
import { handOffSpar } from '../../app/spars/actions';
import type { HandOffDraft, HandOffPath } from '../../spars/spar-moves';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { FieldError } from '../field-error/field-error';

export type SparHandOffCardProps = {
  sparId: number;
  /** The Agent's draft, which the User edits before approving. */
  draft: HandOffDraft;
};

const pathNames: Record<HandOffPath, { label: string; hint: string }> = {
  ticket: {
    label: 'File as Ticket',
    hint: 'Into the Backlog’s Intake, for triage as usual.',
  },
  spec: {
    label: 'Spec it',
    hint: 'File it and start a Spec Conversation on it now.',
  },
};

/**
 * The Hand-off card (GLOSSARY: Hand-off): Claude's draft of an idea Ticket,
 * which the User edits, and the path to take, Claude's recommendation
 * preselected. Approve files it; with Spec it, the Spec Conversation opens.
 * A refusal names its field or shows above the buttons.
 */
export const SparHandOffCard: FC<SparHandOffCardProps> = ({
  sparId,
  draft,
}) => {
  const dialog = useConversationDialog();
  const titleId = useId();
  const titleError = useId();
  const descriptionId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<HandOffDraft>({ defaultValues: draft });
  const titleReason = errors.title?.message;
  const serverError = errors.root?.server?.message;

  const submit = handleSubmit(async (values) => {
    const result = await callAction(
      () => handOffSpar({ sparId, ...values }),
      'The Hand-off could not be saved. Try again.',
    );
    if (!result.ok) {
      const field = (['title', 'description', 'path'] as const).find(
        (name) => result.fieldErrors?.[name],
      );
      if (field) {
        setError(field, {
          type: 'server',
          message: result.fieldErrors?.[field],
        });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    if (result.specError) {
      // The Ticket is filed: the outcome shows on the page, and this says why
      // its Spec did not start.
      window.alert(result.specError);
    }
    if (result.conversation) {
      dialog.open(result.conversation.id);
    }
  });

  return (
    <Box
      backgroundColor={modeColors.primarySubtle}
      borderRadius={3}
      padding={3}
    >
      <form aria-label="Hand-off" onSubmit={submit}>
        <Stack gap={3}>
          <Heading level={2} fontSize="medium">
            Hand-off
          </Heading>
          <Text tag="p" fontSize="small" color="muted">
            Claude drafted an idea Ticket from the Write-up. Edit it, then
            approve it.
          </Text>
          <Stack gap={1}>
            <Label htmlFor={titleId}>Title</Label>
            <TextInput
              {...register('title')}
              id={titleId}
              autoComplete="off"
              aria-invalid={titleReason ? true : undefined}
              aria-describedby={titleReason ? titleError : undefined}
            />
            <FieldError id={titleError} reason={titleReason} />
          </Stack>
          <Stack gap={1}>
            <Label htmlFor={descriptionId}>Description</Label>
            <Textarea
              {...register('description')}
              id={descriptionId}
              rows={8}
            />
            <FieldError
              id={`${descriptionId}-error`}
              reason={errors.description?.message}
            />
          </Stack>
          <Stack gap={1} role="radiogroup" aria-label="Path">
            {(Object.keys(pathNames) as HandOffPath[]).map((path) => (
              <Stack key={path} gap={0}>
                <Radio {...register('path')} value={path}>
                  {pathNames[path].label}
                  {path === draft.path ? ' (recommended)' : ''}
                </Radio>
                <Text fontSize="small" color="muted">
                  {pathNames[path].hint}
                </Text>
              </Stack>
            ))}
          </Stack>
          {serverError && <Alert intent="danger">{serverError}</Alert>}
          <Inline gap={2}>
            <Button type="submit" size="small" loading={isSubmitting}>
              Approve
            </Button>
          </Inline>
        </Stack>
      </form>
    </Box>
  );
};
