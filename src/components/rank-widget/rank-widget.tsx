'use client';

import { Box, Button, IconButton, Inline, Stack, Text } from '@blockle/blocks';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import type { FC } from 'react';

import { modeColors } from '../../app/lib/mode-colors';
import type { RankWidget as RankWidgetShape } from '../../conversations/widget';
import { Icon } from '../icon/icon';
import { WidgetForm } from '../widget-form/widget-form';

export type RankWidgetProps = {
  conversationId: number;
  entryId: number;
  widget: RankWidgetShape;
};

type RankValue = { order: string[] };

/** `items` with the one at `from` moved to `to`. */
function moved<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

type RankItemProps = {
  item: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
};

/** One item of the rank list: a drag handle, its place, and move up and down. */
const RankItem: FC<RankItemProps> = ({ item, index, count, onMove }) => {
  const { ref, handleRef } = useSortable({ id: item, index });
  return (
    <Box
      asChild
      backgroundColor={modeColors.raised}
      borderRadius={2}
      paddingBlock={1}
      paddingInline={1}
    >
      <li ref={ref}>
        <Inline gap={1} alignY="center" flexWrap="nowrap">
          <Button
            ref={handleRef}
            type="button"
            variant="ghost"
            size="small"
            aria-label={`Drag ${item}`}
          >
            <Icon name="bars-3" size="small" />
          </Button>
          <Text fontWeight="strong" color="muted">
            {index + 1}.
          </Text>
          <Box flex={1}>
            <Text>{item}</Text>
          </Box>
          <IconButton
            variant="ghost"
            size="small"
            label={`Move ${item} up`}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          >
            <Icon name="chevron-up" size="small" />
          </IconButton>
          <IconButton
            variant="ghost"
            size="small"
            label={`Move ${item} down`}
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
          >
            <Icon name="chevron-down" size="small" />
          </IconButton>
        </Inline>
      </li>
    </Box>
  );
};

/**
 * A rank list (ADR 0045): the User puts the items in order, most important
 * first, by dragging a handle (Space lifts and drops it, arrow keys move it)
 * or with each item's move up and down buttons. It starts in the order the
 * Agent gave.
 */
export const RankWidget: FC<RankWidgetProps> = ({
  conversationId,
  entryId,
  widget,
}) => (
  <WidgetForm<RankValue>
    conversationId={conversationId}
    entryId={entryId}
    prompt={widget.prompt}
    initial={{ order: widget.items }}
    answerOf={({ order }) => ({ order })}
  >
    {({ watch, setValue }) => {
      const order = watch('value.order') as string[];
      const reorder = (from: number, to: number) =>
        setValue('value.order', moved(order, from, to) as never);
      const drop = (event: DragEndEvent) => {
        const { source } = event.operation;
        if (
          event.canceled ||
          !isSortable(source) ||
          source.initialIndex === source.index
        ) {
          return;
        }
        reorder(source.initialIndex, source.index);
      };
      return (
        <DragDropProvider onDragEnd={drop}>
          <Stack gap={1} listStyle="none" role="list" asChild>
            <ol aria-label="Order">
              {order.map((item, index) => (
                <RankItem
                  key={item}
                  item={item}
                  index={index}
                  count={order.length}
                  onMove={(to) => reorder(index, to)}
                />
              ))}
            </ol>
          </Stack>
        </DragDropProvider>
      );
    }}
  </WidgetForm>
);
