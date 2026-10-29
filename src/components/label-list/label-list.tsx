'use client';

import { IconButton, Inline, Tag } from '@blockle/blocks';
import type { FC } from 'react';

import { Icon } from '../icon/icon';

export type LabelListProps = {
  labels: string[];
  /** The list's accessible name. Defaults to `Labels`. */
  name?: string;
  /** When given, each label gets a button that removes it. */
  onRemove?: (label: string) => void;
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
          <Tag
            key={label}
            asChild
            endSlot={
              onRemove && (
                <IconButton
                  type="button"
                  variant="ghost"
                  intent="inherit"
                  shape="circle"
                  size="small"
                  label={`Remove label ${label}`}
                  onClick={() => onRemove(label)}
                >
                  <Icon name="x-mark" size="small" />
                </IconButton>
              )
            }
          >
            <li>{label}</li>
          </Tag>
        ))}
      </ul>
    </Inline>
  );
};
