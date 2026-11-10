'use client';

import { Box, Checkbox, Radio, Stack, Tag, Text } from '@blockle/blocks';
import type { FC } from 'react';

import { modeColors } from '../../app/lib/mode-colors';
import type { ChoiceWidget as ChoiceWidgetShape } from '../../conversations/widget';
import { WidgetForm } from '../widget-form/widget-form';

export type ChoiceWidgetProps = {
  conversationId: number;
  entryId: number;
  widget: ChoiceWidgetShape;
};

type ChoiceValue = { choice: string; choices: string[] };

/**
 * Choice cards (ADR 0045): radios for a single select, checkboxes for a
 * multi select, each option a card with its description. The Agent's
 * recommended options start selected and are marked, so agreeing is one
 * click on Send. Arrow keys move between the radios, Space ticks a checkbox.
 */
export const ChoiceWidget: FC<ChoiceWidgetProps> = ({
  conversationId,
  entryId,
  widget,
}) => {
  const recommended = widget.recommended ?? [];
  return (
    <WidgetForm<ChoiceValue>
      conversationId={conversationId}
      entryId={entryId}
      prompt={widget.prompt}
      initial={{ choice: recommended[0] ?? '', choices: recommended }}
      answerOf={({ choice, choices }) => {
        const selected = widget.multiSelect
          ? (choices ?? [])
          : choice
            ? [choice]
            : [];
        return selected.length === 0 ? null : { selected };
      }}
    >
      {({ register }) => (
        <Stack gap={1} role="group" aria-label="Options">
          {widget.options.map(({ label, description }) => (
            <Box
              key={label}
              backgroundColor={modeColors.raised}
              borderRadius={2}
              paddingBlock={1}
              paddingInline={2}
            >
              <Stack gap={0}>
                {widget.multiSelect ? (
                  <Checkbox {...register('value.choices')} value={label}>
                    {label}
                  </Checkbox>
                ) : (
                  <Radio {...register('value.choice')} value={label}>
                    {label}
                  </Radio>
                )}
                {recommended.includes(label) && (
                  <Box>
                    <Tag intent="primary">Recommended</Tag>
                  </Box>
                )}
                {description && (
                  <Text fontSize="small" color="muted">
                    {description}
                  </Text>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </WidgetForm>
  );
};
