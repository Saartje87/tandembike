'use client';

import {
  Box,
  Heading,
  Inline,
  Tag,
  Text,
  VisuallyHidden,
} from '@blockle/blocks';
import { type FC, useId } from 'react';

import { ticketByNumberPath } from '../../app/lib/paths';
import type { EpicChild } from '../../tickets/tickets';
import { AppLink } from '../app-link/app-link';
import { BlockedMarker } from '../blocked-marker/blocked-marker';
import { type ChildrenBoard, childLink } from '../epic-children/child-link';
import { Icon } from '../icon/icon';
import * as styles from './epic-order.css';
import {
  layoutEpicOrder,
  type OrderEdge,
  type OrderLayout,
  type OrderNode,
  type OutsideBlocker,
} from './epic-order-layout';

export type EpicOrderProps = {
  /** The Epic's children; archived ones are left out. */
  items: EpicChild[];
  /** Their direct Blockers from outside the Epic. Defaults to none. */
  outside?: OutsideBlocker[];
  /**
   * The Board the drawer opens over, where a child on it opens. Defaults to
   * none: each child opens over its own Board.
   */
  board?: ChildrenBoard;
};

/** How a node shows its Ticket's Status. */
function variantOf(node: OrderNode): keyof typeof styles.node {
  const { status } = node.ticket;
  if (status === 'Done') {
    return 'done';
  }
  if (status === 'In progress') {
    return 'inProgress';
  }
  return !node.outside && !node.ticket.blocked ? 'ready' : 'todo';
}

type OrderNodeLinkProps = {
  node: OrderNode;
  /** The Tickets whose arrows lead to it, by Ticket number. */
  after: number[];
  board?: ChildrenBoard;
};

/** One Ticket of the diagram, linked to open it. */
const OrderNodeLink: FC<OrderNodeLinkProps> = ({ node, after, board }) => {
  const { number, title, status } = node.ticket;
  const variant = variantOf(node);
  const blocked = !node.outside && node.ticket.blocked && status !== 'Done';
  const link = node.outside
    ? { href: ticketByNumberPath(number) }
    : childLink(number, board);
  return (
    <AppLink
      {...link}
      intent="inherit"
      title={`T${number} ${title}`}
      className={[styles.node[variant], node.outside ? styles.outside : '']
        .filter(Boolean)
        .join(' ')}
    >
      <Inline gap={1} alignY="center" flexWrap="nowrap">
        <Text fontSize="xsmall" fontFamily="mono" color="muted">
          T{number}
        </Text>
        {status === 'Done' && <Icon name="check-circle" size="small" />}
      </Inline>{' '}
      <Text fontSize="small" truncate>
        {title}
      </Text>
      {blocked && (
        <Inline gap={0}>
          <BlockedMarker />
        </Inline>
      )}
      {variant === 'ready' && (
        <Inline gap={0}>
          <Tag intent="success">Ready to start</Tag>
        </Inline>
      )}
      <VisuallyHidden>
        {[
          `, ${status}`,
          ...(node.outside ? ['outside this Epic'] : []),
          ...(after.length > 0
            ? [`after ${after.map((each) => `T${each}`).join(', ')}`]
            : []),
        ].join(', ')}
      </VisuallyHidden>
    </AppLink>
  );
};

/** A share of the whole, as an SVG percentage. */
const percent = (part: number, whole: number) => `${(part / whole) * 100}%`;

type ArrowsProps = { layout: OrderLayout };

/**
 * The diagram's arrows in one SVG behind its rows, each from the middle of
 * its Blocker's cell to the top of the cell below it blocks. Every cell has
 * the same size, so its row and column place each end.
 */
const Arrows: FC<ArrowsProps> = ({ layout }) => {
  const headId = `epic-order-head-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const at = new Map(
    layout.nodes.map((node) => [node.ticket.number, node] as const),
  );
  const line = (edge: OrderEdge) => {
    const from = at.get(edge.from) as OrderNode;
    const to = at.get(edge.to) as OrderNode;
    return (
      <line
        key={`${edge.from}-${edge.to}`}
        x1={percent(from.column + 0.5, layout.columns)}
        y1={percent(from.row + 0.5, layout.rows)}
        x2={percent(to.column + 0.5, layout.columns)}
        y2={percent(to.row, layout.rows)}
        className={
          edge.outside ? `${styles.arrow} ${styles.outsideArrow}` : styles.arrow
        }
        markerEnd={`url(#${headId})`}
      />
    );
  };
  return (
    <svg className={styles.arrows} aria-hidden="true" focusable="false">
      <defs>
        <marker
          id={headId}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrowHead} />
        </marker>
      </defs>
      {layout.edges.map(line)}
    </svg>
  );
};

/**
 * An Epic's children as a diagram of the order to work them in, read top to
 * bottom: each sits below its Blockers, with an arrow from each, and a
 * Blocker from outside the Epic shows faded above the child it blocks. In a
 * section that opens and closes on its heading, and scrolls sideways when a
 * row is wider than the drawer. Nothing shows without unarchived children.
 */
export const EpicOrder: FC<EpicOrderProps> = ({
  items,
  outside = [],
  board,
}) => {
  const headingId = useId();
  const layout = layoutEpicOrder(items, outside);
  if (layout.nodes.length === 0) {
    return null;
  }
  const grid: (OrderNode | undefined)[][] = Array.from(
    { length: layout.rows },
    () => Array.from({ length: layout.columns }, () => undefined),
  );
  for (const node of layout.nodes) {
    grid[node.row][node.column] = node;
  }
  const afterOf = (number: number) =>
    layout.edges.filter((edge) => edge.to === number).map((edge) => edge.from);
  return (
    <section aria-labelledby={headingId}>
      <details open>
        <Box asChild className={styles.summary} paddingBlockEnd={2}>
          <summary>
            <Inline gap={2} alignY="center">
              <span className={styles.chevron}>
                <Icon name="chevron-right" size="small" />
              </span>
              <Heading id={headingId} level={3} fontSize="medium">
                Order
              </Heading>
            </Inline>
          </summary>
        </Box>
        <Box overflowInline="auto">
          <div className={styles.canvas}>
            <Arrows layout={layout} />
            {grid.map((cells, row) => (
              // Each row is a step of the order: a Ticket below starts after
              // the ones above it that it is linked to.
              <Box
                // biome-ignore lint/suspicious/noArrayIndexKey: a row is only its place
                key={row}
                asChild
                listStyle="none"
                margin={0}
                padding={0}
                role="list"
                aria-label={`Step ${row + 1}`}
                className={styles.row}
              >
                <ul>
                  {cells.map((node, column) =>
                    node ? (
                      <li key={node.ticket.number} className={styles.cell}>
                        <OrderNodeLink
                          node={node}
                          after={
                            node.outside ? [] : afterOf(node.ticket.number)
                          }
                          board={board}
                        />
                      </li>
                    ) : (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: an empty cell is only its place
                        key={`empty-${column}`}
                        aria-hidden="true"
                        className={styles.cell}
                      />
                    ),
                  )}
                </ul>
              </Box>
            ))}
          </div>
        </Box>
      </details>
    </section>
  );
};
