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
import { type FC, useId, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { refusalReason } from '../../app/lib/action-result';
import {
  addTicketComment,
  editTicketComment,
  removeTicketComment,
  type TicketCommentResult,
} from '../../app/tickets/actions';
import type { ActivityEntry as Entry } from '../../tickets/activity';
import type { Comment } from '../../tickets/tickets';
import { ActivityEntry, actorNames } from '../activity-entry/activity-entry';
import { DateTime } from '../date-time/date-time';
import { FieldError } from '../field-error/field-error';
import { InlineEdit } from '../inline-edit/inline-edit';
import { Markdown } from '../markdown/markdown';

export type TicketCommentsProps = {
  ticketNumber: number;
  /** The Ticket's comments, oldest first. */
  comments: Comment[];
  /** The Ticket's Activity, oldest first. Defaults to none. */
  activity?: Entry[];
};

/** A comment or an Activity entry in the timeline. */
type TimelineItem =
  | { kind: 'comment'; comment: Comment }
  | { kind: 'activity'; entry: Entry };

/**
 * `comments` and `activity` merged into one list, oldest first; at the same
 * moment, Activity comes first.
 */
function timelineOf(comments: Comment[], activity: Entry[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...activity.map((entry) => ({ kind: 'activity' as const, entry })),
    ...comments.map((comment) => ({ kind: 'comment' as const, comment })),
  ];
  const timeOf = (item: TimelineItem) =>
    (item.kind === 'comment' ? item.comment : item.entry).createdAt.getTime();
  return items.sort((left, right) => timeOf(left) - timeOf(right));
}

const noActivity: Entry[] = [];

type CommentItemProps = { comment: Comment };

/**
 * One comment: who wrote it and when, and its Markdown body, which edits in
 * place, with a button to remove it after a confirmation.
 */
const CommentItem: FC<CommentItemProps> = ({ comment }) => {
  // Whether it asks to confirm the removal.
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const [removePending, startRemove] = useTransition();

  const askToRemove = (next: boolean) => () => {
    setError(undefined);
    setRemoving(next);
  };

  const saveBody = async (body: string) => {
    const result = await editTicketComment({ id: comment.id, body });
    return refusalReason(result, 'body');
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
                {actorNames[comment.author]}
              </Text>
              <Text fontSize="small" color="muted">
                <DateTime date={comment.createdAt} />
              </Text>
              {comment.editedAt && (
                <Text fontSize="small" color="muted">
                  edited <DateTime date={comment.editedAt} />
                </Text>
              )}
            </Inline>
            {!removing && !editing && (
              <Button
                type="button"
                variant="ghost"
                size="small"
                intent="danger"
                onClick={askToRemove(true)}
              >
                Remove
              </Button>
            )}
          </Inline>
          <InlineEdit
            multiline
            rows={4}
            value={comment.body}
            label="Comment"
            renderContent={(body) => (
              <Markdown headingLevel={4}>{body}</Markdown>
            )}
            onEditingChange={setEditing}
            onSave={saveBody}
          />
          {removing && (
            <Stack gap={2}>
              <Text tag="p" fontSize="small">
                Remove this comment? It cannot be restored.
              </Text>
              <Inline gap={2}>
                <Button
                  type="button"
                  size="small"
                  intent="danger"
                  loading={removePending}
                  disabled={removePending}
                  onClick={remove}
                >
                  Remove comment
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  disabled={removePending}
                  onClick={askToRemove(false)}
                >
                  Cancel
                </Button>
              </Inline>
            </Stack>
          )}
          {error && <Alert intent="danger">{error}</Alert>}
        </Stack>
      </li>
    </Box>
  );
};

type CommentFormProps = {
  label: string;
  submitLabel: string;
  /** Saves the body; the form shows the result's error if it fails. */
  save: (body: string) => Promise<TicketCommentResult>;
  /** Runs once a save succeeds. */
  onSaved: () => void;
};

/**
 * A Markdown textarea with a submit button, for a new comment. It keeps the
 * draft and shows the Tickets module's reason when a save is refused.
 */
const CommentForm: FC<CommentFormProps> = ({
  label,
  submitLabel,
  save,
  onSaved,
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
    defaultValues: { body: '' },
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
        {error && <Alert intent="danger">{error}</Alert>}
        <Inline gap={2}>
          <Button
            type="submit"
            size="small"
            loading={isSubmitting}
            disabled={isSubmitting || watch('body').trim() === ''}
          >
            {submitLabel}
          </Button>
        </Inline>
      </Stack>
    </form>
  );
};

/**
 * A Ticket's timeline: its comments and Activity entries, oldest first, with
 * a form to add a comment. Changes are saved at once, apart from the
 * drawer's Save; the drawer refreshes to show them.
 */
export const TicketComments: FC<TicketCommentsProps> = ({
  ticketNumber,
  comments,
  activity = noActivity,
}) => {
  const [formKey, setFormKey] = useState(0);
  const headingId = useId();
  const timeline = timelineOf(comments, activity);

  return (
    <Stack gap={2}>
      <Heading id={headingId} level={3} fontSize="medium">
        Comments and Activity
      </Heading>
      {timeline.length === 0 ? (
        <Text tag="p" color="muted">
          No comments or Activity
        </Text>
      ) : (
        <Stack gap={2} listStyle="none" role="list" asChild>
          <ul aria-labelledby={headingId}>
            {timeline.map((item) =>
              item.kind === 'comment' ? (
                <CommentItem
                  key={`comment-${item.comment.id}`}
                  comment={item.comment}
                />
              ) : (
                <ActivityEntry
                  key={`activity-${item.entry.id}`}
                  entry={item.entry}
                />
              ),
            )}
          </ul>
        </Stack>
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
