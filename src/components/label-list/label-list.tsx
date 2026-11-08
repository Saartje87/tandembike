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
  /**
   * When given, the list shows at most this many labels on one line, then a
   * `+N` tag whose accessible name and tooltip list the rest.
   */
  max?: number;
};

/** A Ticket's labels as small pills; nothing when it has none. */
export const LabelList: FC<LabelListProps> = ({
  labels,
  name = 'Labels',
  onRemove,
  max,
}) => {
  if (labels.length === 0) {
    return null;
  }

  const shown = max === undefined ? labels : labels.slice(0, max);
  const hidden = labels.slice(shown.length);
  const hiddenText = hidden.join(', ');

  return (
    <Inline
      gap={1}
      flexWrap={max === undefined ? 'wrap' : 'nowrap'}
      listStyle="none"
      role="list"
      asChild
    >
      <ul aria-label={name}>
        {shown.map((label) => (
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
        {hidden.length > 0 && (
          <Tag asChild>
            <li
              aria-label={`${hidden.length} more ${hidden.length === 1 ? 'label' : 'labels'}: ${hiddenText}`}
              title={hiddenText}
            >
              +{hidden.length}
            </li>
          </Tag>
        )}
      </ul>
    </Inline>
  );
};
