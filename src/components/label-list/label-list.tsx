'use client';

import { Box, Button, Inline, Text } from '@blockle/blocks';
import type { FC, MouseEvent } from 'react';

import { Icon } from '../icon/icon';
import * as styles from './label-list.css';

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
    <Box asChild display="flex" flexWrap="wrap" gap={1} className={styles.list}>
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
                <Text fontSize="xsmall" color="text-700">
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
    </Box>
  );
};
