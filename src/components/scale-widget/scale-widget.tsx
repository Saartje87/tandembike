'use client';

import { Box, Inline, Slider, Stack, Text } from '@blockle/blocks';
import type { FC } from 'react';

import type { ScaleWidget as ScaleWidgetShape } from '../../conversations/widget';
import { WidgetForm } from '../widget-form/widget-form';

export type ScaleWidgetProps = {
  conversationId: number;
  entryId: number;
  widget: ScaleWidgetShape;
};

type ScaleValue = { values: number[] };

/**
 * A scale (ADR 0045): a labelled slider per item from the Agent's min to its
 * max, each starting in the middle, its value shown beside it. Arrow keys,
 * Home and End move a focused slider.
 */
export const ScaleWidget: FC<ScaleWidgetProps> = ({
  conversationId,
  entryId,
  widget,
}) => {
  const { items, min, max, minLabel, maxLabel } = widget;
  const middle = Math.round((min + max) / 2);
  return (
    <WidgetForm<ScaleValue>
      conversationId={conversationId}
      entryId={entryId}
      prompt={widget.prompt}
      initial={{ values: items.map(() => middle) }}
      answerOf={({ values }) => ({
        values: items.map((item, index) => ({ item, value: values[index] })),
      })}
    >
      {({ watch, setValue }) => {
        const values = watch('value.values') as number[];
        return (
          <Stack gap={2}>
            {(minLabel || maxLabel) && (
              <Inline gap={2} alignX="between">
                <Text fontSize="small" color="muted">
                  {min}: {minLabel}
                </Text>
                <Text fontSize="small" color="muted">
                  {max}: {maxLabel}
                </Text>
              </Inline>
            )}
            {items.map((item, index) => (
              <Stack key={item} gap={1}>
                <Inline gap={2} alignX="between">
                  <Text>{item}</Text>
                  <Text fontWeight="strong">{values[index]}</Text>
                </Inline>
                <Box paddingInline={2}>
                  {/* The Slider ignores a non-zero min (T1310), so it runs from 0 and min is added. */}
                  <Slider
                    aria-label={item}
                    aria-valuetext={String(values[index])}
                    min={0}
                    max={max - min}
                    step={1}
                    value={values[index] - min}
                    onChange={(value) =>
                      setValue(
                        `value.values.${index}` as never,
                        (Math.round(value) + min) as never,
                      )
                    }
                  />
                </Box>
              </Stack>
            ))}
          </Stack>
        );
      }}
    </WidgetForm>
  );
};
