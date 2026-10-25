'use client';

import { Box, Button, Checkbox, Inline, Stack, Text } from '@blockle/blocks';
import type { FC, MouseEvent } from 'react';

import { ticketByNumberPath, ticketOnBoardPath } from '../../app/lib/paths';
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
  cardRef?: (element: Element | null) => void;
  dragHandleRef?: (element: Element | null) => void;
  /** Whether the card is selected. Leave it out for a card that cannot be. */
  selected?: boolean;
  /** Whether any card on the Board is selected, which shows every checkbox. */
  selecting?: boolean;
  /**
   * Selects or unselects the card: `toggle` for a Cmd-click, Ctrl-click or
   * its checkbox, `range` for a Shift-click.
   */
  onSelect?: (mode: SelectMode) => void;
};

export type SelectMode = 'toggle' | 'range';

/** Whether a click asks to select rather than open the drawer. */
const isSelectClick = (event: MouseEvent) =>
  event.metaKey || event.ctrlKey || event.shiftKey;

type CriteriaProgressProps = Pick<Ticket, 'acceptanceCriteria'>;

/** A pill that says the Ticket is blocked by an unresolved Blocker. */
const BlockedMarker: FC = () => (
  // `Inline` takes no `role` and cannot render a `span` (docs/blocks-feedback.md, 15).
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

/** How many acceptance criteria are checked, as `2/4`; nothing without any. */
const CriteriaProgress: FC<CriteriaProgressProps> = ({
  acceptanceCriteria,
}) => {
  if (acceptanceCriteria.length === 0) {
    return null;
  }
  const checked = acceptanceCriteria.filter((criterion) => criterion.checked);
  const total = acceptanceCriteria.length;

  // `Inline` takes no `role` and cannot render a `span` (docs/blocks-feedback.md, 15).
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
 * colour linking to it,
 * whether it is blocked (unless it is Done), labels and acceptance-criteria
 * progress, and a drag handle.
 * It is highlighted for a moment after the Ticket changes (see `LiveUpdates`).
 */
export const TicketCard: FC<TicketCardProps> = ({
  ticket,
  boardPath,
  cardRef,
  dragHandleRef,
  selected,
  selecting = false,
  onSelect,
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
    onSelect(event.shiftKey ? 'range' : 'toggle');
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
      paddingInlineEnd={3}
      transition="slow"
    >
      <li
        ref={cardRef}
        data-changed={changed ? '' : undefined}
        data-selecting={selecting ? '' : undefined}
        className={styles.card}
        onClickCapture={selectByClick}
      >
        <Inline gap={2} alignY="stretch">
          <Button
            ref={dragHandleRef}
            type="button"
            variant="ghost"
            size="small"
            alignSelf="stretch"
            aria-label={`Drag Ticket #${ticket.number} to another Status`}
          >
            <Icon name="bars-3" size="small" />
          </Button>
          <Stack gap={2} paddingBlock={3} className={styles.cardContent}>
            <Text wordBreak="break-word" className={styles.title}>
              <AppLink
                href={ticketOnBoardPath(boardPath, ticket.number)}
                scroll={false}
                variant="inherit"
                aria-label={ticket.title}
              >
                <Text color="text-600" fontSize="small" marginInlineEnd={1}>
                  #{ticket.number}
                </Text>

                {ticket.title}
              </AppLink>
            </Text>

            {ticket.epic && (
              <Text fontSize="xsmall" className={styles.epicLine}>
                <AppLink
                  href={ticketByNumberPath(ticket.epic.number)}
                  variant="inherit"
                  aria-label={`Epic #${ticket.epic.number} ${ticket.epic.title}`}
                  data-color={ticket.epic.color}
                  className={`${styles.epicBadge} ${tinted[ticket.epic.color]}`}
                >
                  #{ticket.epic.number} {ticket.epic.title}
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
                aria-label={`Select #${ticket.number} ${ticket.title}`}
                className={styles.selectBox}
                checked={selected}
                onChange={(event) =>
                  onSelect(
                    event.nativeEvent instanceof globalThis.MouseEvent &&
                      event.nativeEvent.shiftKey
                      ? 'range'
                      : 'toggle',
                  )
                }
              />
            </Box>
          )}
        </Inline>
      </li>
    </Box>
  );
};
