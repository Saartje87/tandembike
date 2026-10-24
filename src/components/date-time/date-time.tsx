import { Text } from '@blockle/blocks';
import type { FC } from 'react';

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export type DateTimeProps = { date: Date };

/** A date and time as a `<time>`, such as "1 Mar 2026, 09:00". */
export const DateTime: FC<DateTimeProps> = ({ date }) => (
  <Text asChild>
    <time dateTime={date.toISOString()}>{timeFormat.format(date)}</time>
  </Text>
);
