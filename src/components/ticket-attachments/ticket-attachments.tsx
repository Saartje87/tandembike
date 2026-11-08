'use client';

import {
  Alert,
  Box,
  Button,
  Dialog,
  Heading,
  Inline,
  Link,
  Stack,
  Text,
} from '@blockle/blocks';
import {
  type DragEvent,
  type FC,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useForm } from 'react-hook-form';

import { modeColors } from '../../app/lib/mode-colors';
import { attachmentPath } from '../../app/lib/paths';
import {
  addTicketAttachments,
  removeTicketAttachment,
} from '../../app/tickets/actions';
import { formatSize, isPreviewable } from '../../tickets/attachment-preview';
import type { Attachment } from '../../tickets/attachments';
import { namePastedFile } from '../../tickets/pasted-file-name';
import { actorNames } from '../activity-entry/activity-entry';
import { DateTime } from '../date-time/date-time';
import { FieldError } from '../field-error/field-error';
import * as styles from './ticket-attachments.css';

export type TicketAttachmentsProps = {
  ticketNumber: number;
  /** The Ticket's Attachments, in the order they were added. */
  attachments: Attachment[];
};

type AttachmentItemProps = { attachment: Attachment };

/**
 * One Attachment: a thumbnail that opens a previewable image full size in a
 * new tab, or a name-and-size link that downloads any other file, with who
 * added it and when, and a button to remove it after a confirmation.
 */
const AttachmentItem: FC<AttachmentItemProps> = ({ attachment }) => {
  // Whether the removal confirmation is open.
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [removePending, startRemove] = useTransition();
  const headingId = useId();
  const descriptionId = useId();

  const closeDialog = () => {
    setConfirming(false);
    setError(undefined);
  };

  const remove = () => {
    setError(undefined);
    startRemove(async () => {
      const result = await removeTicketAttachment({ id: attachment.id });
      if (result.ok) {
        setConfirming(false);
      } else {
        setError(result.error);
      }
    });
  };

  const previewable = isPreviewable(attachment.mediaType);
  const href = attachmentPath(attachment.id);
  return (
    <Box
      asChild
      backgroundColor={modeColors.sunken}
      borderRadius={2}
      paddingBlock={2}
      paddingInline={3}
    >
      <li>
        <Stack gap={2}>
          {/* A plain Blocks Link, not AppLink: Next's Link would prefetch the file (up to 10 MB). */}
          <Link
            href={href}
            target="_blank"
            rel="noreferrer"
            download={previewable ? undefined : ''}
          >
            {previewable ? (
              // Blocks has no Image component (T572).
              // biome-ignore lint/performance/noImgElement: a plain served file, not an optimizable asset
              <img
                className={styles.thumbnail}
                src={href}
                alt={attachment.name}
                loading="lazy"
              />
            ) : (
              `${attachment.name} (${formatSize(attachment.size)})`
            )}
          </Link>
          <Inline gap={2} alignY="center" justifyContent="space-between">
            <Inline gap={2} alignY="center" flexWrap="wrap">
              <Text fontSize="small" fontWeight="strong">
                {actorNames[attachment.author]}
              </Text>
              <Text fontSize="small" color="muted">
                <DateTime date={attachment.createdAt} />
              </Text>
            </Inline>

            <Button
              type="button"
              variant="ghost"
              size="small"
              intent="danger"
              onClick={() => setConfirming(true)}
            >
              Remove
            </Button>
          </Inline>
          <Dialog
            open={confirming}
            onRequestClose={closeDialog}
            aria-labelledby={headingId}
            aria-describedby={descriptionId}
          >
            {confirming && (
              <Stack gap={4}>
                <Heading id={headingId} level={2}>
                  {`Remove ${attachment.name}?`}
                </Heading>
                <Text id={descriptionId} tag="p">
                  It cannot be restored once removed.
                </Text>
                {error && <Alert intent="danger">{error}</Alert>}
                <Inline gap={2}>
                  <Button
                    type="button"
                    intent="danger"
                    loading={removePending}
                    disabled={removePending}
                    onClick={remove}
                  >
                    Remove attachment
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={removePending}
                    onClick={closeDialog}
                  >
                    Cancel
                  </Button>
                </Inline>
              </Stack>
            )}
          </Dialog>
        </Stack>
      </li>
    </Box>
  );
};

/** A paste here goes to the field, as the browser does by default. */
const editableField =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * The files of a paste that the Ticket drawer around the section attaches,
 * or none when the paste is left to the browser: when it lands in a text
 * field or outside the drawer, when a dialog other than the drawer is open,
 * such as one nested in it, or when the clipboard holds no files.
 */
const pastedFiles = (event: ClipboardEvent, drawer: Element): File[] => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return [];
  }
  if (target !== document.body && !drawer.contains(target)) {
    return [];
  }
  if (target.closest(editableField)) {
    return [];
  }
  // Any open dialog but the drawer: one nested in it, or one over it such
  // as the Conversation dialog.
  const otherDialogOpen = Array.from(
    document.querySelectorAll('dialog[open]'),
  ).some((dialog) => dialog !== drawer);
  if (otherDialogOpen) {
    return [];
  }
  return Array.from(event.clipboardData?.files ?? []);
};

/**
 * A Ticket's Attachments, below its description, with a button to add files
 * and a drop target for them. A refusal shows on the section.
 */
export const TicketAttachments: FC<TicketAttachmentsProps> = ({
  ticketNumber,
  attachments,
}) => {
  const headingId = useId();
  const errorId = useId();
  const input = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLElement>(null);
  const {
    setError,
    clearErrors,
    formState: { errors },
  } = useForm({ defaultValues: {} });
  const reason = errors.root?.server?.message;
  // Adds may overlap, from the button, a drop or a paste, so the pending
  // state is a count of adds, not one submit's `isSubmitting`. Next runs
  // them one after another.
  const [pending, setPending] = useState(0);

  const add = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    clearErrors('root.server');
    setPending((count) => count + 1);
    try {
      const form = new FormData();
      form.set('number', String(ticketNumber));
      for (const file of files) {
        form.append('files', file);
      }
      const result = await addTicketAttachments(form);
      if (!result.ok) {
        setError('root.server', { message: result.error });
      }
    } finally {
      setPending((count) => count - 1);
    }
  };

  const attachPasted = useEffectEvent(
    (event: ClipboardEvent, drawer: Element) => {
      const files = pastedFiles(event, drawer);
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      const now = new Date();
      void add(files.map((file) => namePastedFile(file, now)));
      const reduceMotion = matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      section.current?.scrollIntoView({
        behavior: reduceMotion ? 'instant' : 'smooth',
        block: 'nearest',
      });
    },
  );

  // A paste anywhere in the drawer the section is in attaches its files. A
  // paste outside any field targets the body, so listen on the document.
  useEffect(() => {
    const drawer = section.current?.closest('dialog');
    if (!drawer) {
      return;
    }
    const listener = (event: ClipboardEvent) => attachPasted(event, drawer);
    document.addEventListener('paste', listener);
    return () => document.removeEventListener('paste', listener);
  }, []);

  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    void add(Array.from(event.dataTransfer.files));
  };

  return (
    <Stack gap={2} asChild>
      <section
        ref={section}
        aria-labelledby={headingId}
        aria-describedby={reason ? errorId : undefined}
        // A drop only reaches onDrop when dragover stops the browser opening the file.
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
      >
        <Inline gap={2} alignY="center" justifyContent="space-between">
          <Heading id={headingId} level={3} fontSize="medium">
            Attachments
          </Heading>
          <Button
            type="button"
            variant="ghost"
            size="small"
            onClick={() => input.current?.click()}
          >
            {pending > 0 ? 'Adding...' : 'Add files'}
          </Button>
          {/* Blocks has no file input, so a hidden native one sits behind the button (T404). */}
          <input
            ref={input}
            type="file"
            multiple
            hidden
            aria-label="Files to attach"
            onChange={(event) => {
              void add(Array.from(event.target.files ?? []));
              // So picking the same file again still fires a change.
              event.target.value = '';
            }}
          />
        </Inline>
        <FieldError id={errorId} reason={reason} />
        {attachments.length === 0 ? (
          <Text tag="p" color="muted">
            No Attachments. Drop or paste files here.
          </Text>
        ) : (
          <Stack gap={2} listStyle="none" role="list" asChild>
            <ul aria-labelledby={headingId}>
              {attachments.map((attachment) => (
                <AttachmentItem key={attachment.id} attachment={attachment} />
              ))}
            </ul>
          </Stack>
        )}
      </section>
    </Stack>
  );
};
