import { Text } from '@blockle/blocks';
import type { FC } from 'react';

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** A date and time as `DateTime` shows it, such as "1 Mar 2026, 09:00". */
export function formatDateTime(date: Date): string {
  return timeFormat.format(date);
}

export type DateTimeProps = { date: Date };

/** A date and time as a `<time>`, such as "1 Mar 2026, 09:00". */
export const DateTime: FC<DateTimeProps> = ({ date }) => (
  <Text asChild>
    <time dateTime={date.toISOString()}>{formatDateTime(date)}</time>
  </Text>
);
