'use client';

import { Button, Inline, Select, Stack, Text } from '@blockle/blocks';
import {
  type FC,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
} from 'react';

import {
  type MatrixWidget as MatrixWidgetShape,
  type Quadrant,
  quadrantOf,
} from '../../conversations/widget';
import { WidgetForm } from '../widget-form/widget-form';
import * as styles from './matrix-widget.css';

export type MatrixWidgetProps = {
  conversationId: number;
  entryId: number;
  widget: MatrixWidgetShape;
};

type Point = { x: number; y: number };
type MatrixValue = { placed: (Point | null)[] };

const quadrants: Quadrant[] = ['low-high', 'high-high', 'low-low', 'high-low'];

/** The middle of a quadrant, where the picker puts an item. */
const centreOf = (quadrant: Quadrant): Point => {
  const [xEnd, yEnd] = quadrant.split('-');
  return { x: xEnd === 'low' ? 0.25 : 0.75, y: yEnd === 'low' ? 0.25 : 0.75 };
};

/** The custom property name of a vanilla-extract variable, `--x` of `var(--x)`. */
const propertyOf = (variable: string) =>
  variable.replace(/^var\((.*)\)$/, '$1');

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 100) / 100;

/** How far an arrow key nudges an item; Shift nudges further. */
const nudge = (shift: boolean) => (shift ? 0.25 : 0.05);

const arrows: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
};

type MatrixItemProps = {
  item: string;
  point: Point | null;
  label: string;
  area: RefObject<HTMLFieldSetElement | null>;
  onPlace: (point: Point) => void;
};

/**
 * An item: on the matrix once placed, below it before. A pointer drags it
 * onto or across the matrix; arrow keys nudge it once placed.
 */
const MatrixItem: FC<MatrixItemProps> = ({
  item,
  point,
  label,
  area,
  onPlace,
}) => {
  const button = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);

  // The position goes in the CSS variables of `placed`, set here as the
  // repository has no inline style props.
  useLayoutEffect(() => {
    const element = button.current;
    if (element && point) {
      element.style.setProperty(propertyOf(styles.x), String(point.x));
      element.style.setProperty(propertyOf(styles.y), String(point.y));
    }
  }, [point]);

  const placeAt = (event: PointerEvent) => {
    const rect = area.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return;
    }
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (inside || point) {
      onPlace({
        x: round(clamp((event.clientX - rect.left) / rect.width)),
        y: round(clamp((rect.bottom - event.clientY) / rect.height)),
      });
    }
  };

  const keyDown = (event: KeyboardEvent) => {
    const arrow = arrows[event.key];
    if (!arrow || !point) {
      return;
    }
    event.preventDefault();
    const step = nudge(event.shiftKey);
    onPlace({
      x: round(clamp(point.x + arrow.x * step)),
      y: round(clamp(point.y + arrow.y * step)),
    });
  };

  return (
    <Button
      ref={button}
      type="button"
      size="small"
      variant={point ? 'solid' : 'outline'}
      className={point ? styles.placed : styles.unplaced}
      aria-label={label}
      onKeyDown={keyDown}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (dragging.current) {
          placeAt(event);
        }
      }}
      onPointerUp={(event) => {
        if (dragging.current) {
          dragging.current = false;
          placeAt(event);
        }
      }}
    >
      {item}
    </Button>
  );
};

/**
 * A 2×2 matrix (ADR 0045) whose axes the Agent labelled. The User drags each
 * item onto it, or picks its quadrant and nudges it with the arrow keys
 * (Shift for bigger steps). Send is active once every item is placed.
 */
export const MatrixWidget: FC<MatrixWidgetProps> = ({
  conversationId,
  entryId,
  widget,
}) => {
  const area = useRef<HTMLFieldSetElement>(null);
  const { items, xAxis, yAxis } = widget;
  const quadrantName = (quadrant: Quadrant) => {
    const [xEnd, yEnd] = quadrant.split('-') as ('low' | 'high')[];
    return `${xAxis[xEnd]}, ${yAxis[yEnd]}`;
  };
  return (
    <WidgetForm<MatrixValue>
      conversationId={conversationId}
      entryId={entryId}
      prompt={widget.prompt}
      initial={{ placed: items.map(() => null) }}
      answerOf={({ placed }) =>
        placed.every((point) => point !== null)
          ? {
              positions: items.map((item, index) => {
                const { x, y } = placed[index] as Point;
                return { item, x, y, quadrant: quadrantOf(x, y) };
              }),
            }
          : null
      }
    >
      {({ watch, setValue }) => {
        const placed = watch('value.placed') as (Point | null)[];
        const place = (index: number, point: Point) =>
          setValue(`value.placed.${index}` as never, point as never);
        const labelOf = (item: string, point: Point | null) =>
          point
            ? `${item}: ${quadrantName(quadrantOf(point.x, point.y))} (${Math.round(point.x * 100)}%, ${Math.round(point.y * 100)}%)`
            : `${item}: not placed`;
        return (
          <Stack gap={2}>
            <Stack gap={1} alignX="center">
              <Text fontSize="small" color="muted">
                ↑ {yAxis.high}
              </Text>
              <Inline gap={2} alignY="center" flexWrap="nowrap">
                <Text fontSize="small" color="muted">
                  {xAxis.low}
                </Text>
                <fieldset
                  ref={area}
                  className={styles.area}
                  aria-label={`Matrix: ${xAxis.low} to ${xAxis.high} across, ${yAxis.low} to ${yAxis.high} up`}
                >
                  {items.map((item, index) =>
                    placed[index] ? (
                      <MatrixItem
                        key={item}
                        item={item}
                        point={placed[index]}
                        label={labelOf(item, placed[index])}
                        area={area}
                        onPlace={(point) => place(index, point)}
                      />
                    ) : null,
                  )}
                </fieldset>
                <Text fontSize="small" color="muted">
                  {xAxis.high} →
                </Text>
              </Inline>
              <Text fontSize="small" color="muted">
                {yAxis.low}
              </Text>
            </Stack>
            <Inline gap={1} flexWrap="wrap" aria-label="Not placed yet">
              {items.map((item, index) =>
                placed[index] ? null : (
                  <MatrixItem
                    key={item}
                    item={item}
                    point={null}
                    label={labelOf(item, null)}
                    area={area}
                    onPlace={(point) => place(index, point)}
                  />
                ),
              )}
            </Inline>
            <Stack gap={1}>
              {items.map((item, index) => {
                const point = placed[index];
                return (
                  <Inline key={item} gap={2} alignY="center" flexWrap="nowrap">
                    <Text>{item}</Text>
                    <Select
                      size="small"
                      aria-label={`Quadrant of ${item}`}
                      value={point ? quadrantOf(point.x, point.y) : ''}
                      onChange={(event) => {
                        const quadrant = event.target.value as Quadrant;
                        if (quadrants.includes(quadrant)) {
                          place(index, centreOf(quadrant));
                        }
                      }}
                    >
                      <option value="" disabled>
                        Not placed
                      </option>
                      {quadrants.map((quadrant) => (
                        <option key={quadrant} value={quadrant}>
                          {quadrantName(quadrant)}
                        </option>
                      ))}
                    </Select>
                  </Inline>
                );
              })}
            </Stack>
          </Stack>
        );
      }}
    </WidgetForm>
  );
};
