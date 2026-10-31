'use client';

import {
  Alert,
  Box,
  Button,
  Heading,
  Inline,
  Stack,
  Text,
} from '@blockle/blocks';
import { type FC, useId, useState, useTransition } from 'react';

import { modeColors } from '../../app/lib/mode-colors';
import { attachmentPath } from '../../app/lib/paths';
import { removeTicketAttachment } from '../../app/tickets/actions';
import { formatSize, isPreviewable } from '../../tickets/attachment-preview';
import type { Attachment } from '../../tickets/attachments';
import { actorNames } from '../activity-entry/activity-entry';
import { AppLink } from '../app-link/app-link';
import { DateTime } from '../date-time/date-time';
import * as styles from './ticket-attachments.css';

export type TicketAttachmentsProps = {
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
  // Whether it asks to confirm the removal.
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string>();
  const [removePending, startRemove] = useTransition();

  const askToRemove = (next: boolean) => () => {
    setError(undefined);
    setRemoving(next);
  };

  const remove = () => {
    setError(undefined);
    startRemove(async () => {
      const result = await removeTicketAttachment({ id: attachment.id });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

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
          {isPreviewable(attachment.mediaType) ? (
            <AppLink href={href} target="_blank" rel="noreferrer">
              {/* biome-ignore lint/performance/noImgElement: a plain served file, not an optimizable asset */}
              <img
                className={styles.thumbnail}
                src={href}
                alt={attachment.name}
                loading="lazy"
              />
            </AppLink>
          ) : (
            <AppLink href={href} target="_blank" rel="noreferrer">
              {`${attachment.name} (${formatSize(attachment.size)})`}
            </AppLink>
          )}
          <Inline gap={2} alignY="center" justifyContent="space-between">
            <Inline gap={2} alignY="center" flexWrap="wrap">
              <Text fontSize="small" fontWeight="strong">
                {actorNames[attachment.author]}
              </Text>
              <Text fontSize="small" color="muted">
                <DateTime date={attachment.createdAt} />
              </Text>
            </Inline>

            {!removing && (
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
          {removing && (
            <Stack gap={2}>
              <Text tag="p" fontSize="small">
                {`Remove ${attachment.name}? It cannot be restored.`}
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
                  Remove attachment
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

/** A Ticket's Attachments, below its description. */
export const TicketAttachments: FC<TicketAttachmentsProps> = ({
  attachments,
}) => {
  const headingId = useId();
  return (
    <Stack gap={2}>
      <Heading id={headingId} level={3} fontSize="medium">
        Attachments
      </Heading>
      {attachments.length === 0 ? (
        <Text tag="p" color="muted">
          No Attachments
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
    </Stack>
  );
};
