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
import { useDroppable } from '@dnd-kit/react';
import { type FC, useId, useRef, useState } from 'react';

import { ticketOnBoardPath } from '../../app/lib/paths';
import { epicLinkOf, type Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { Icon } from '../icon/icon';
import { NewTicketInline } from '../new-ticket-inline/new-ticket-inline';
import { tinted } from '../palette/palette.css';
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
  /**
   * Hide done Epics behind a "Show done Epics" switch, as the Project Board
   * does; a Cycle's Board shows them all. Defaults to true.
   */
  hideDone?: boolean;
};

/** The drop-target id of Epic `number`'s chip, for a card dragged onto it. */
export function epicDropTarget(number: number): string {
  return `epic:${number}`;
}

/** The Epic whose chip drop-target id `id` is, if it is one. */
export function epicOfDropTarget(id: unknown): number | undefined {
  const match = typeof id === 'string' ? /^epic:(\d+)$/.exec(id) : null;
  return match ? Number(match[1]) : undefined;
}

type EpicChipProps = { epic: Ticket; boardPath: string };

/**
 * One Epic in its colour: its number, title and how many of its children
 * that are not archived are Done, as a link that opens its drawer. A card
 * dropped on it joins the Epic, and it is outlined while one is over it.
 */
const EpicChip: FC<EpicChipProps> = ({ epic, boardPath }) => {
  const { ref, isDropTarget } = useDroppable({
    id: epicDropTarget(epic.number),
    collisionPriority: 2,
  });
  const live = epic.children.filter((child) => !child.archived);
  const done = live.filter((child) => child.status === 'Done');
  const { color } = epicLinkOf(epic);

  return (
    <Box
      asChild
      borderRadius="full"
      paddingBlock={1}
      paddingInline={3}
      className={`${styles.chip} ${tinted[color]} ${isDropTarget ? styles.dropTarget : ''}`}
    >
      <li
        ref={ref}
        data-color={color}
        data-drop-target={isDropTarget ? '' : undefined}
      >
        <Text fontSize="small" wordBreak="break-word">
          <AppLink
            href={ticketOnBoardPath(boardPath, epic.number)}
            scroll={false}
            variant="inherit"
          >
            <Text fontWeight="medium">T{epic.number}</Text> {epic.title}{' '}
            <Text fontWeight="medium">
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
 * Epics hidden behind a "Show done Epics" switch unless `hideDone` is off,
 * and a New Epic button
 * that opens a title field to create one.
 */
export const EpicChips: FC<EpicChipsProps> = ({
  epics,
  projectId,
  cycleId,
  boardPath,
  hideDone = true,
}) => {
  const headingId = useId();
  const switchId = useId();
  const newEpicButton = useRef<HTMLButtonElement>(null);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const doneCount = hideDone
    ? epics.filter((epic) => epic.status === 'Done').length
    : 0;
  const shown =
    showDone || !hideDone
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
