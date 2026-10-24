'use client';

import { Select, type SelectProps } from '@blockle/blocks';
import type { FC } from 'react';

import { isStatus, type Status, statuses } from '../../tickets/status';

export type StatusSelectProps = Omit<
  SelectProps,
  'children' | 'value' | 'onChange'
> & {
  value: Status;
  /** Called with the Status the User picks. */
  onChange: (status: Status) => void;
};

/** A select offering every Status, in Board column order. */
export const StatusSelect: FC<StatusSelectProps> = ({
  value,
  onChange,
  ...props
}) => (
  <Select
    {...props}
    value={value}
    onChange={(event) => {
      const picked = event.currentTarget.value;
      if (isStatus(picked)) {
        onChange(picked);
      }
    }}
  >
    {statuses.map((status) => (
      <option key={status} value={status}>
        {status}
      </option>
    ))}
  </Select>
);
