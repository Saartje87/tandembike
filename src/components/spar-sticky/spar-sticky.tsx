'use client';

import {
  Box,
  Button,
  IconButton,
  Inline,
  Menu,
  Stack,
  Tag,
} from '@blockle/blocks';
import { useSortable } from '@dnd-kit/react/sortable';
import type { FC } from 'react';

import { ticketByNumberPath } from '../../app/lib/paths';
import {
  parseTicketNumber,
  ticketNumberRule,
} from '../../app/lib/ticket-number';
import type { CanvasOp, Sticky } from '../../spars/canvas';
import { AppLink } from '../app-link/app-link';
import { Icon } from '../icon/icon';
import { InlineEdit } from '../inline-edit/inline-edit';
import { Markdown } from '../markdown/markdown';
import * as styles from './spar-sticky.css';

export type SparStickyProps = {
  sticky: Sticky;
  /** Its place in its Column, from 0. */
  index: number;
  /** Its Column's id, the sortable group it is dragged in. */
  columnId: number;
  /** The Columns it can move to, other than its own. */
  otherColumns: { id: number; title: string }[];
  /** Saves edits of the Canvas; resolves to the reason when refused. */
  onEdit: (ops: CanvasOp[]) => Promise<string | undefined>;
  /** A closed Spar's Sticky: shown, never edited. */
  readOnly: boolean;
  /** It arrived from the Agent just now: it animates in. */
  arrived?: boolean;
};

/**
 * A Sticky on a Spar's Canvas (GLOSSARY: Sticky): its title and note, which
 * edit in place, who wrote it, and the Ticket it links to. It drags by its
 * handle, Space and arrow keys included, and its "Move to" menu moves it to
 * another Column.
 */
export const SparSticky: FC<SparStickyProps> = ({
  sticky,
  index,
  columnId,
  otherColumns,
  onEdit,
  readOnly,
  arrived = false,
}) => {
  const { ref, handleRef } = useSortable({
    id: sticky.id,
    index,
    group: columnId,
    type: 'sticky',
    accept: 'sticky',
    disabled: readOnly,
  });
  const edit = (
    input: Omit<Extract<CanvasOp, { op: 'editSticky' }>, 'op' | 'stickyId'>,
  ) => onEdit([{ op: 'editSticky', stickyId: sticky.id, ...input }]);

  return (
    <li
      ref={ref}
      className={styles.sticky}
      data-arrived={String(arrived)}
      aria-label={sticky.title}
    >
      <Stack gap={1}>
        <Inline gap={1} alignY="center" flexWrap="nowrap">
          {!readOnly && (
            <Button
              ref={handleRef}
              type="button"
              variant="ghost"
              size="small"
              aria-label={`Drag ${sticky.title}`}
            >
              <Icon name="bars-3" size="small" />
            </Button>
          )}
          <Box flex={1}>
            <InlineEdit
              value={sticky.title}
              label="Sticky title"
              readOnly={readOnly}
              onSave={(title) => edit({ title })}
            />
          </Box>
          {!readOnly && (
            <Menu
              items={[
                ...otherColumns.map((column) => ({
                  label: `Move to ${column.title}`,
                  onSelect: () =>
                    void onEdit([
                      {
                        op: 'moveSticky',
                        stickyId: sticky.id,
                        columnId: column.id,
                      },
                    ]),
                })),
                { type: 'separator' as const },
                {
                  label: 'Delete',
                  onSelect: () =>
                    void onEdit([{ op: 'removeSticky', stickyId: sticky.id }]),
                },
              ]}
            >
              <IconButton
                variant="ghost"
                size="small"
                label={`Actions for ${sticky.title}`}
              >
                <Icon name="ellipsis-horizontal" size="small" />
              </IconButton>
            </Menu>
          )}
        </Inline>
        <InlineEdit
          value={sticky.note ?? ''}
          label="Note"
          multiline
          rows={4}
          readOnly={readOnly}
          placeholder={readOnly ? undefined : 'Add a note…'}
          renderContent={(note) => (
            <Markdown headingLevel={5} breaks>
              {note}
            </Markdown>
          )}
          onSave={(note) => edit({ note })}
        />
        <Inline gap={1} alignY="center">
          <Tag intent={sticky.author === 'agent' ? 'info' : 'neutral'}>
            {sticky.author === 'agent' ? 'Claude' : 'You'}
          </Tag>
          {(!readOnly || sticky.ticketNumber !== null) && (
            <InlineEdit
              value={
                sticky.ticketNumber === null ? '' : `T${sticky.ticketNumber}`
              }
              label="Linked Ticket"
              readOnly={readOnly}
              placeholder="Link a Ticket…"
              renderContent={(text) => {
                const number = parseTicketNumber(text);
                return number === undefined ? (
                  text
                ) : (
                  <AppLink href={ticketByNumberPath(number)}>T{number}</AppLink>
                );
              }}
              onSave={async (text) => {
                if (text.trim() === '') {
                  return edit({ ticketNumber: null });
                }
                const number = parseTicketNumber(text);
                return number === undefined
                  ? ticketNumberRule
                  : edit({ ticketNumber: number });
              }}
            />
          )}
        </Inline>
      </Stack>
    </li>
  );
};
