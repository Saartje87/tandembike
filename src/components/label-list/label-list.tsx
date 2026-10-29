'use client';

import { Box, Button, Inline, Text } from '@blockle/blocks';
import type { FC, MouseEvent } from 'react';

import { Icon } from '../icon/icon';

export type LabelListProps = {
  labels: string[];
  /** The list's accessible name. Defaults to `Labels`. */
  name?: string;
  /** When given, each label gets a button that removes it. */
  onRemove?: (label: string, event: MouseEvent) => void;
};

/** A Ticket's labels as small pills; nothing when it has none. */
export const LabelList: FC<LabelListProps> = ({
  labels,
  name = 'Labels',
  onRemove,
}) => {
  if (labels.length === 0) {
    return null;
  }

  return (
    <Inline gap={1} flexWrap="wrap" listStyle="none" role="list" asChild>
      <ul aria-label={name}>
        {labels.map((label) => (
          <Box
            key={label}
            asChild
            backgroundColor="neutral-200"
            borderRadius="full"
            paddingInlineStart={2}
            paddingInlineEnd={onRemove ? 0 : 2}
          >
            <li>
              <Inline gap={0} alignY="center">
                <Text fontSize="xsmall" color="neutral-800">
                  {label}
                </Text>
                {onRemove && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    aria-label={`Remove label ${label}`}
                    onClick={(event) => onRemove(label, event)}
                  >
                    <Icon name="x-mark" size="small" />
                  </Button>
                )}
              </Inline>
            </li>
          </Box>
        ))}
      </ul>
    </Inline>
  );
};
