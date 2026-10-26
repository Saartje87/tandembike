import { Text } from '@blockle/blocks';
import type { FC } from 'react';

import { formatDateTime } from '../date-time/date-time';

const relativeFormat = new Intl.RelativeTimeFormat('en-GB', {
  numeric: 'auto',
});

/** Each unit from the largest, with its length in seconds. */
const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

/** How long ago `date` was, such as "5 minutes ago", or "just now". */
function timeAgo(date: Date, now: Date): string {
  const seconds = (now.getTime() - date.getTime()) / 1000;
  for (const [unit, length] of units) {
    if (Math.abs(seconds) >= length) {
      return relativeFormat.format(-Math.round(seconds / length), unit);
    }
  }
  return 'just now';
}

export type RelativeTimeProps = { date: Date };

/**
 * A date as how long ago it was, as a `<time>` that shows the exact date and
 * time on hover.
 */
export const RelativeTime: FC<RelativeTimeProps> = ({ date }) => (
  <Text asChild>
    <time
      dateTime={date.toISOString()}
      title={formatDateTime(date)}
      // The server renders it a moment before the browser hydrates it.
      suppressHydrationWarning
    >
      {timeAgo(date, new Date())}
    </time>
  </Text>
);
