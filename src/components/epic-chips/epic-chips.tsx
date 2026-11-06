'use client';

import {
  Box,
  Button,
  Heading,
  Inline,
  Label,
  Stack,
  Switch,
  Tag,
  Text,
} from '@blockle/blocks';
import { useDroppable } from '@dnd-kit/react';
import { type FC, useId, useRef, useState } from 'react';

import { type BoardFilter, ticketOnBoardPath } from '../../app/lib/paths';
import { epicLinkOf } from '../../tickets/epic-link';
import type { Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { laneOf } from '../board/board-lanes';
import { useLiveConversations } from '../conversation-activity/conversation-activity';
import { Icon } from '../icon/icon';
import { MergedButton } from '../merged-button/merged-button';
import { NewTicketInline } from '../new-ticket-inline/new-ticket-inline';
import { tinted } from '../palette/palette.css';
import { StatusLine } from '../status-line/status-line';
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
  /** The Board filter, which an Epic's drawer keeps. Defaults to none. */
  filter?: BoardFilter;
  /**
   * Hide done Epics behind a "Show done Epics" switch, as the Project Board
   * does; a Cycle's Board shows them all. Defaults to true.
   */
  hideDone?: boolean;
  /** Called with the number of an Epic created from the row. */
  onCreated?: (number: number) => void;
  /** Called with an Epic in Review the User says is merged. */
  onMerged?: (epic: Ticket) => void;
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

type EpicChipProps = {
  epic: Ticket;
  boardPath: string;
  filter?: BoardFilter;
  onMerged?: (epic: Ticket) => void;
};

const badgeIntent = {
  'Action needed': 'warning',
  Running: 'info',
  Review: 'success',
} as const;

/**
 * One Epic in its colour: its number, title and how many of its children
 * that are not archived are Done, as a link that opens its drawer. A card
 * dropped on it joins the Epic, and it is outlined while one is over it.
 */
const EpicChip: FC<EpicChipProps> = ({ epic, boardPath, filter, onMerged }) => {
  const live = useLiveConversations()[epic.number];
  const { section } = laneOf(epic, live);
  const { ref, isDropTarget } = useDroppable({
    id: epicDropTarget(epic.number),
    collisionPriority: 2,
  });
  const children = epic.children.filter((child) => !child.archived);
  const done = children.filter((child) => child.status === 'Done');
  const { color } = epicLinkOf(epic);

  return (
    <Box
      asChild
      borderRadius={3}
      paddingBlock={1}
      paddingInline={3}
      className={`${styles.chip} ${tinted[color]} ${isDropTarget ? styles.dropTarget : ''}`}
    >
      <li
        ref={ref}
        data-color={color}
        data-drop-target={isDropTarget ? '' : undefined}
      >
        <Stack gap={1}>
          <Inline gap={2} alignY="center" flexWrap="wrap">
            <Text fontSize="small" wordBreak="break-word">
              <AppLink
                href={ticketOnBoardPath(boardPath, epic.number, filter)}
                scroll={false}
                intent="inherit"
              >
                <Text fontWeight="medium">T{epic.number}</Text> {epic.title}{' '}
                <Text fontWeight="medium">
                  {done.length}/{children.length} Done
                </Text>
              </AppLink>
            </Text>
            {section && <Tag intent={badgeIntent[section]}>{section}</Tag>}
            {section === 'Review' && onMerged && (
              <MergedButton ticket={epic} onMerged={() => onMerged(epic)} />
            )}
          </Inline>
          {live && <StatusLine live={live} />}
        </Stack>
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
  filter,
  hideDone = true,
  onCreated,
  onMerged,
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
            flexWrap="wrap"
            alignY="center"
            aria-labelledby={headingId}
            listStyle="none"
            role="list"
            asChild
          >
            <ul>
              {shown.map((epic) => (
                <EpicChip
                  key={epic.number}
                  epic={epic}
                  boardPath={boardPath}
                  filter={filter}
                  onMerged={onMerged}
                />
              ))}
            </ul>
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
              <Switch
                id={switchId}
                checked={showDone}
                onChange={(event) => setShowDone(event.target.checked)}
              />
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
              onCreated={onCreated}
              onDone={closeNewEpic}
            />
          </Box>
        )}
      </Stack>
    </section>
  );
};
