'use client';

import {
  Box,
  Button,
  Heading,
  Inline,
  Label,
  Stack,
  Switch,
  Text,
} from '@blockle/blocks';
import { type FC, useId, useRef, useState } from 'react';

import { ticketOnBoardPath } from '../../app/lib/paths';
import type { Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { Icon } from '../icon/icon';
import { NewTicketInline } from '../new-ticket-inline/new-ticket-inline';
import * as styles from './epic-chips.css';

export type EpicChipsProps = {
  /** The Epics to list, oldest-created first. */
  epics: Ticket[];
  /** The Project a new Epic goes in. */
  projectId: number;
  /** The Cycle to plan a new Epic into, on that Cycle's Board. */
  cycleId?: number;
  /** The Board's own URL, which an Epic's drawer opens over. */
  boardPath: string;
};

type EpicChipProps = { epic: Ticket; boardPath: string };

/**
 * One Epic: its number, title and how many of its children that are not
 * archived are Done, as a link that opens its drawer.
 */
const EpicChip: FC<EpicChipProps> = ({ epic, boardPath }) => {
  const live = epic.children.filter((child) => !child.archived);
  const done = live.filter((child) => child.status === 'Done');

  return (
    <Box
      asChild
      backgroundColor="neutral-100"
      borderRadius="full"
      paddingBlock={1}
      paddingInline={3}
      className={styles.chip}
    >
      <li>
        <Text fontSize="small" wordBreak="break-word">
          <AppLink
            href={ticketOnBoardPath(boardPath, epic.number)}
            scroll={false}
            variant="inherit"
          >
            <Text color="text-600">#{epic.number}</Text> {epic.title}{' '}
            <Text color="text-600">
              {done.length}/{live.length} Done
            </Text>
          </AppLink>
        </Text>
      </li>
    </Box>
  );
};

/**
 * The Board's Epics, apart from its Status columns: a row of chips, done
 * Epics hidden behind a "Show done Epics" switch, and a New Epic button
 * that opens a title field to create one.
 */
export const EpicChips: FC<EpicChipsProps> = ({
  epics,
  projectId,
  cycleId,
  boardPath,
}) => {
  const headingId = useId();
  const switchId = useId();
  const newEpicButton = useRef<HTMLButtonElement>(null);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const doneCount = epics.filter((epic) => epic.status === 'Done').length;
  const shown = showDone
    ? epics
    : epics.filter((epic) => epic.status !== 'Done');

  const closeNewEpic = () => {
    setAdding(false);
    newEpicButton.current?.focus();
  };

  return (
    <section aria-labelledby={headingId}>
      <Stack gap={2}>
        <Inline gap={2} alignY="center" flexWrap="wrap">
          <Heading id={headingId} level={2} fontSize="medium">
            Epics
          </Heading>
          <Inline
            gap={2}
            tag="ul"
            flexWrap="wrap"
            alignY="center"
            aria-labelledby={headingId}
            className={styles.chipList}
          >
            {shown.map((epic) => (
              <EpicChip key={epic.number} epic={epic} boardPath={boardPath} />
            ))}
          </Inline>
          <Button
            ref={newEpicButton}
            type="button"
            variant="ghost"
            size="small"
            aria-expanded={adding}
            startSlot={<Icon name="plus" size="small" />}
            onClick={() => setAdding((current) => !current)}
          >
            New Epic
          </Button>
          {doneCount > 0 && (
            <Inline gap={2} alignY="center">
              <Switch id={switchId} checked={showDone} onChange={setShowDone} />
              <Label htmlFor={switchId}>Show done Epics ({doneCount})</Label>
            </Inline>
          )}
        </Inline>
        {adding && (
          <Box className={styles.newEpic}>
            <NewTicketInline
              projectId={projectId}
              cycleId={cycleId}
              type="Epic"
              autoFocus
              onDone={closeNewEpic}
            />
          </Box>
        )}
      </Stack>
    </section>
  );
};
