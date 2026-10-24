'use client';

import {
  Alert,
  Box,
  Button,
  Heading,
  Inline,
  Label,
  Stack,
  Text,
  Textarea,
} from '@blockle/blocks';
import {
  type FC,
  type MouseEvent,
  useId,
  useState,
  useTransition,
} from 'react';
import { useForm } from 'react-hook-form';

import {
  addTicketComment,
  editTicketComment,
  removeTicketComment,
  type TicketCommentResult,
} from '../../app/tickets/actions';
import type { Comment, CommentAuthor } from '../../tickets/tickets';
import { DateTime } from '../date-time/date-time';
import { FieldError } from '../field-error/field-error';
import { Markdown } from '../markdown/markdown';
import { keepDrawerOpen } from '../ticket-drawer/keep-drawer-open';
import * as styles from './ticket-comments.css';

export type TicketCommentsProps = {
  ticketNumber: number;
  /** The Ticket's comments, oldest first. */
  comments: Comment[];
};

const authorNames: Record<CommentAuthor, string> = {
  user: 'User',
  agent: 'Agent',
};

type CommentItemProps = { comment: Comment };

/**
 * One comment: who wrote it and when, and its Markdown body, with buttons
 * to edit it in place or remove it after a confirmation.
 */
const CommentItem: FC<CommentItemProps> = ({ comment }) => {
  const [mode, setMode] = useState<'show' | 'edit' | 'remove'>('show');
  const [error, setError] = useState<string>();
  const [removing, startRemove] = useTransition();

  const switchTo = (next: typeof mode) => (event: MouseEvent) => {
    keepDrawerOpen(event);
    setError(undefined);
    setMode(next);
  };

  const remove = () => {
    setError(undefined);
    startRemove(async () => {
      const result = await removeTicketComment({ id: comment.id });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    <Box
      asChild
      backgroundColor="neutral-100"
      borderRadius={2}
      paddingBlock={2}
      paddingInline={3}
    >
      <li>
        <Stack gap={2}>
          <Inline gap={2} alignY="center" justifyContent="space-between">
            <Inline gap={2} alignY="center" flexWrap="wrap">
              <Text fontSize="small" fontWeight="strong">
                {authorNames[comment.author]}
              </Text>
              <Text fontSize="small" color="text-600">
                <DateTime date={comment.createdAt} />
              </Text>
              {comment.editedAt && (
                <Text fontSize="small" color="text-600">
                  edited <DateTime date={comment.editedAt} />
                </Text>
              )}
            </Inline>
            {mode === 'show' && (
              <Inline gap={1} alignY="center">
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  onClick={switchTo('edit')}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  intent="danger"
                  onClick={switchTo('remove')}
                >
                  Remove
                </Button>
              </Inline>
            )}
          </Inline>
          {mode === 'edit' ? (
            <CommentForm
              label="Edit comment"
              submitLabel="Save"
              initialBody={comment.body}
              save={(body) => editTicketComment({ id: comment.id, body })}
              onSaved={() => setMode('show')}
              onCancel={switchTo('show')}
            />
          ) : (
            <Markdown headingLevel={4}>{comment.body}</Markdown>
          )}
          {mode === 'remove' && (
            <Stack gap={2}>
              <Text tag="p" fontSize="small">
                Remove this comment? It cannot be restored.
              </Text>
              <Inline gap={2}>
                <Button
                  type="button"
                  size="small"
                  intent="danger"
                  loading={removing}
                  disabled={removing}
                  onClick={remove}
                >
                  Remove comment
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  disabled={removing}
                  onClick={switchTo('show')}
                >
                  Cancel
                </Button>
              </Inline>
            </Stack>
          )}
          {error && <Alert intent="error">{error}</Alert>}
        </Stack>
      </li>
    </Box>
  );
};

type CommentFormProps = {
  label: string;
  submitLabel: string;
  /** The body to start from. Defaults to empty. */
  initialBody?: string;
  /** Saves the body; the form shows the result's error if it fails. */
  save: (body: string) => Promise<TicketCommentResult>;
  /** Runs once a save succeeds. */
  onSaved: () => void;
  /** When given, the form gets a Cancel button that calls it. */
  onCancel?: (event: MouseEvent) => void;
};

/**
 * A Markdown textarea with a submit button, for a new comment or an edit.
 * It keeps the draft and shows the Tickets module's reason when a save is
 * refused.
 */
const CommentForm: FC<CommentFormProps> = ({
  label,
  submitLabel,
  initialBody = '',
  save,
  onSaved,
  onCancel,
}) => {
  const inputId = useId();
  const errorId = useId();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<{ body: string }>({
    defaultValues: { body: initialBody },
    // A refused body keeps its reason until the next submit.
    reValidateMode: 'onSubmit',
  });
  const fieldError = errors.body?.message;
  const error = errors.root?.server?.message;

  const submit = handleSubmit(async ({ body }) => {
    const result = await save(body);
    if (!result.ok) {
      const bodyReason = result.fieldErrors?.body;
      if (bodyReason) {
        setError('body', { type: 'server', message: bodyReason });
      } else {
        setError('root.server', { message: result.error });
      }
      return;
    }
    onSaved();
  });

  return (
    <form
      onSubmit={(event) => {
        // The disabled submit button does not stop every submit, so a
        // comment saves once.
        if (isSubmitting) {
          event.preventDefault();
          return;
        }
        submit(event);
      }}
    >
      <Stack gap={1}>
        <Label htmlFor={inputId}>{label}</Label>
        <Textarea
          {...register('body')}
          id={inputId}
          rows={4}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : undefined}
        />
        <FieldError id={errorId} reason={fieldError} />
        {error && <Alert intent="error">{error}</Alert>}
        <Inline gap={2}>
          <Button
            type="submit"
            size="small"
            loading={isSubmitting}
            disabled={isSubmitting || watch('body').trim() === ''}
          >
            {submitLabel}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="small"
              disabled={isSubmitting}
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
 * A Ticket's comments, oldest first, with a form to add one. Changes are
 * saved at once, apart from the drawer's Save; the drawer refreshes to show
 * them.
 */
export const TicketComments: FC<TicketCommentsProps> = ({
  ticketNumber,
  comments,
}) => {
  const [formKey, setFormKey] = useState(0);
  const headingId = useId();

  return (
    <Stack gap={2}>
      <Heading id={headingId} level={3} fontSize="medium">
        Comments
      </Heading>
      {comments.length === 0 ? (
        <Text tag="p" color="text-600">
          No comments
        </Text>
      ) : (
        <Box asChild display="flex" flexDirection="column" gap={2}>
          <ul aria-labelledby={headingId} className={styles.list}>
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </ul>
        </Box>
      )}
      <CommentForm
        key={formKey}
        label="Add a comment"
        submitLabel="Comment"
        save={(body) => addTicketComment({ number: ticketNumber, body })}
        onSaved={() => setFormKey((key) => key + 1)}
      />
    </Stack>
  );
};
