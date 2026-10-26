'use client';

import {
  Alert,
  Button,
  Dialog,
  Heading,
  Inline,
  Stack,
  Text,
} from '@blockle/blocks';
import { type FC, useId, useState, useTransition } from 'react';

import { archiveTicket } from '../../app/tickets/actions';
import { claimOwner } from '../../tickets/claim-owner';
import type { RelatedTicket, Ticket, TicketClaim } from '../../tickets/tickets';
import { keepDrawerOpen } from '../keep-drawer-open/keep-drawer-open';
import { plainList } from './archive-epic-dialog.css';

/** One child of an Epic, with what archiving it too would affect. */
export type ChildArchival = Pick<
  Ticket,
  'number' | 'title' | 'status' | 'claim'
> & {
  /** The Tickets it blocks. */
  blocks: RelatedTicket[];
};

export type ArchiveEpicDialogProps = {
  epic: Pick<Ticket, 'number' | 'title' | 'status' | 'claim'>;
  /** The Tickets the Epic blocks. */
  blocks: RelatedTicket[];
  /** The Epic's children that are not archived: the ones archived with it. */
  epicChildren: ChildArchival[];
};

const ownerOf = ({ agentRunId, agentName }: TicketClaim) =>
  claimOwner(agentRunId, agentName);

/**
 * An Archive button that asks before archiving an Epic with its children
 * that are not archived, all or nothing. It lists each child with its
 * Status, counts the ones not Done, and warns of the Tickets outside them
 * that will no longer be blocked and of any Agent holding a Claim. A
 * refusal is shown in the dialog.
 */
export const ArchiveEpicDialog: FC<ArchiveEpicDialogProps> = ({
  epic,
  blocks,
  epicChildren,
}) => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startArchive] = useTransition();
  const headingId = useId();
  const descriptionId = useId();

  const archived = new Set([
    epic.number,
    ...epicChildren.map(({ number }) => number),
  ]);
  // An archived Blocker counts as resolved, as a Done one already does.
  const unblocked = [{ ...epic, blocks }, ...epicChildren]
    .filter(({ status }) => status !== 'Done')
    .flatMap((blocker) =>
      blocker.blocks
        .filter(({ number, resolved }) => !resolved && !archived.has(number))
        .map(
          ({ number, title }) =>
            `T${number} ${title} will no longer be blocked by T${blocker.number}.`,
        ),
    );
  const warnings = [
    ...unblocked,
    ...(epic.claim ? [`${ownerOf(epic.claim)} has claimed it.`] : []),
    ...epicChildren.flatMap(({ number, title, claim }) =>
      claim ? [`${ownerOf(claim)} has claimed T${number} ${title}.`] : [],
    ),
  ];
  const count = epicChildren.length;
  const unfinished = epicChildren.filter(
    ({ status }) => status !== 'Done',
  ).length;

  const close = () => {
    setOpen(false);
    setError(undefined);
  };

  const confirm = () => {
    setError(undefined);
    startArchive(async () => {
      const result = await archiveTicket({
        number: epic.number,
        withChildren: true,
      });
      if (result.ok) {
        close();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        intent="neutral"
        size="small"
        onClick={(event) => {
          keepDrawerOpen(event);
          setOpen(true);
        }}
      >
        Archive
      </Button>
      <Dialog
        open={open}
        onRequestClose={close}
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
      >
        {open && (
          <Stack gap={4}>
            <Heading id={headingId} level={2}>
              Archive T{epic.number} and its children?
            </Heading>
            <Text id={descriptionId} tag="p">
              Archive T{epic.number} "{epic.title}" and its {count}{' '}
              {count === 1 ? 'child' : 'children'}?{' '}
              {unfinished === 0
                ? `${count === 1 ? 'It is' : 'All of them are'} Done.`
                : `${unfinished} of them ${unfinished === 1 ? 'is' : 'are'} not Done.`}{' '}
              Restoring the Epic brings them back.
            </Text>
            <Stack tag="ul" gap={1} className={plainList} aria-label="Children">
              {epicChildren.map(({ number, title, status }) => (
                <Text key={number} asChild>
                  <li>
                    T{number} {title} ·{' '}
                    <Text
                      tag="span"
                      fontWeight={status === 'Done' ? 'normal' : 'strong'}
                    >
                      {status}
                    </Text>
                  </li>
                </Text>
              ))}
            </Stack>
            {warnings.length > 0 && (
              <Stack
                tag="ul"
                gap={1}
                className={plainList}
                aria-label="Warnings"
              >
                {warnings.map((warning) => (
                  <Text key={warning} asChild>
                    <li>{warning}</li>
                  </Text>
                ))}
              </Stack>
            )}
            {error && <Alert intent="error">{error}</Alert>}
            <Inline gap={2}>
              <Button type="button" disabled={pending} onClick={confirm}>
                Archive T{epic.number}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={(event) => {
                  keepDrawerOpen(event);
                  close();
                }}
              >
                Cancel
              </Button>
            </Inline>
          </Stack>
        )}
      </Dialog>
    </>
  );
};
