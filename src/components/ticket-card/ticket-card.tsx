'use client';

import { Box, Checkbox, Inline, Stack, Text } from '@blockle/blocks';
import type { FC, MouseEvent } from 'react';

import {
  type BoardFilter,
  ticketByNumberPath,
  ticketOnBoardPath,
} from '../../app/lib/paths';
import type { Ticket } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { Icon } from '../icon/icon';
import { LabelList } from '../label-list/label-list';
import { useTicketChanged } from '../live-updates/live-updates';
import { tinted } from '../palette/palette.css';
import * as styles from './ticket-card.css';

export type TicketCardProps = {
  ticket: Ticket;
  /** The URL of the Board the card is on, which its drawer opens over. */
  boardPath: string;
  /** The Board filter, which the card's drawer keeps. Defaults to none. */
  filter?: BoardFilter;
  /** Makes the whole card the drag source on the Board. */
  cardRef?: (element: Element | null) => void;
  /** Whether the card is selected. Leave it out for a card that cannot be. */
  selected?: boolean;
  /** Whether any card on the Board is selected, which shows every checkbox. */
  selecting?: boolean;
  /**
   * Selects or unselects the card: `toggle` for a Cmd-click, Ctrl-click or
   * its checkbox, `range` for a Shift-click.
   */
  onSelect?: (mode: SelectMode) => void;
  /**
   * How many Tickets the card carries while it is dragged, itself included;
   * more than one shows a pill with the count.
   */
  carryCount?: number;
  /** Whether the card is selected and carried along by another one's drag. */
  carriedAlong?: boolean;
};

export type SelectMode = 'toggle' | 'range';

/** Whether a click asks to select rather than open the drawer. */
const isSelectClick = (event: MouseEvent) =>
  event.metaKey || event.ctrlKey || event.shiftKey;

/** A Shift-click selects a range; any other select click toggles. */
const selectModeOf = (event: Event | MouseEvent): SelectMode =>
  'shiftKey' in event && event.shiftKey ? 'range' : 'toggle';

type CriteriaProgressProps = Pick<Ticket, 'acceptanceCriteria'>;

/** A pill that says the Ticket is blocked by an unresolved Blocker. */
const BlockedMarker: FC = () => (
  // `Inline` takes no `role` and cannot render a `span` (T315).
  <Box
    asChild
    display="flex"
    alignItems="center"
    gap={1}
    backgroundColor="warning-100"
    borderRadius="full"
    paddingInline={2}
  >
    <span role="img" aria-label="Blocked by an unresolved Ticket">
      <Icon name="lock-closed" size="small" color="warning-800" />
      <Text fontSize="xsmall" color="warning-800">
        Blocked
      </Text>
    </span>
  </Box>
);

type CarryCountProps = { count: number };

/** A pill on a dragged card saying how many Tickets it carries. */
const CarryCount: FC<CarryCountProps> = ({ count }) => (
  <Box
    asChild
    position="absolute"
    insetBlockStart={0}
    insetInlineEnd={0}
    backgroundColor="primary-600"
    borderRadius="full"
    boxShadow={1}
    paddingInline={2}
    className={styles.carryCount}
  >
    <Text fontSize="xsmall" color="white" whiteSpace="nowrap">
      {count} Tickets
    </Text>
  </Box>
);

/** How many acceptance criteria are checked, as `2/4`; nothing without any. */
const CriteriaProgress: FC<CriteriaProgressProps> = ({
  acceptanceCriteria,
}) => {
  if (acceptanceCriteria.length === 0) {
    return null;
  }
  const checked = acceptanceCriteria.filter((criterion) => criterion.checked);
  const total = acceptanceCriteria.length;

  // `Inline` takes no `role` and cannot render a `span` (T315).
  return (
    <Box asChild display="flex" alignItems="center" gap={1}>
      <span
        role="img"
        aria-label={`Acceptance criteria: ${checked.length} of ${total} checked`}
      >
        <Icon name="check-circle" size="small" color="text-600" />
        <Text fontSize="xsmall" color="text-600">
          {checked.length}/{total}
        </Text>
      </span>
    </Box>
  );
};

/**
 * A normal Ticket on the Board: its number, title, a badge in its Epic's
 * colour linking to it, whether it is blocked (unless it is Done), labels and
 * acceptance-criteria progress. Through `cardRef` the whole card is dragged.
 * It is highlighted for a moment after the Ticket changes (see `LiveUpdates`).
 * While it carries a selection in a drag it shows how many Tickets that is,
 * and the other selected cards are dimmed in place (T243).
 */
export const TicketCard: FC<TicketCardProps> = ({
  ticket,
  boardPath,
  filter,
  cardRef,
  selected,
  selecting = false,
  onSelect,
  carryCount = 1,
  carriedAlong = false,
}) => {
  const changed = useTicketChanged(ticket.number);
  const selectable = selected !== undefined && onSelect !== undefined;

  // Runs before the link's own click, so it neither navigates nor opens a tab.
  const selectByClick = (event: MouseEvent<HTMLLIElement>) => {
    if (
      !selectable ||
      !isSelectClick(event) ||
      (event.target instanceof HTMLInputElement &&
        event.target.type === 'checkbox')
    ) {
      return;
    }
    event.preventDefault();
    onSelect(selectModeOf(event));
  };
  // A Done Ticket's work is finished, so an open Blocker no longer matters here.
  const showBlocked = ticket.blocked && ticket.status !== 'Done';

  return (
    <Box
      asChild
      backgroundColor={changed || selected ? 'primary-100' : 'background-100'}
      borderRadius={2}
      boxShadow={1}
      paddingBlock={0}
      paddingInline={3}
      position="relative"
      transition="slow"
    >
      <li
        ref={cardRef}
        // dnd-kit makes a card it drags a button unless it has a role; it
        // stays a list item, with the drag in its role description.
        // biome-ignore lint/a11y/noRedundantRoles: see above
        role="listitem"
        // Focusable from the first render when it can be dragged, so Space
        // picks it up; dnd-kit would add this only on a later frame.
        tabIndex={cardRef ? 0 : undefined}
        data-changed={changed ? '' : undefined}
        data-selecting={selecting ? '' : undefined}
        data-carried-along={carriedAlong ? '' : undefined}
        className={styles.card}
        onClickCapture={selectByClick}
      >
        <Inline gap={2} alignY="stretch">
          <Stack gap={2} paddingBlock={3} className={styles.cardContent}>
            <Text wordBreak="break-word" className={styles.title}>
              <AppLink
                href={ticketOnBoardPath(boardPath, ticket.number, filter)}
                scroll={false}
                variant="inherit"
                aria-label={ticket.title}
              >
                <Text color="text-600" fontSize="small" marginInlineEnd={1}>
                  T{ticket.number}
                </Text>

                {ticket.title}
              </AppLink>
            </Text>

            {ticket.epic && (
              <Text fontSize="xsmall" className={styles.epicLine}>
                <AppLink
                  href={ticketByNumberPath(ticket.epic.number)}
                  variant="inherit"
                  aria-label={`Epic T${ticket.epic.number} ${ticket.epic.title}`}
                  data-color={ticket.epic.color}
                  className={`${styles.epicBadge} ${tinted[ticket.epic.color]}`}
                >
                  T{ticket.epic.number} {ticket.epic.title}
                </AppLink>
              </Text>
            )}
            {showBlocked || ticket.labels.length > 0 ? (
              <Inline gap={1} alignY="center" flexWrap="wrap">
                {showBlocked && <BlockedMarker />}
                <LabelList labels={ticket.labels} />
              </Inline>
            ) : null}
            <CriteriaProgress acceptanceCriteria={ticket.acceptanceCriteria} />
          </Stack>
          {selectable && (
            <Box paddingBlock={3}>
              <Checkbox
                name={`select-${ticket.number}`}
                aria-label={`Select T${ticket.number} ${ticket.title}`}
                className={styles.selectBox}
                checked={selected}
                onChange={(event) =>
                  // A checkbox's change comes from its click, with its keys.
                  onSelect(selectModeOf(event.nativeEvent))
                }
              />
            </Box>
          )}
        </Inline>
        {carryCount > 1 && <CarryCount count={carryCount} />}
      </li>
    </Box>
  );
};
