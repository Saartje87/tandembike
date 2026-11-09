import { Text } from '@blockle/blocks';
import type { FC } from 'react';

import { AppLink } from '../app-link/app-link';
import type { WhySegment } from './why-here-of';

export type WhyHereProps = {
  segments: WhySegment[];
  /** Where a Ticket named in the sentence opens. */
  ticketHref: (number: number) => string;
  /** Where a Conversation named in the sentence opens. */
  conversationHref: (id: number) => string;
};

/**
 * "Why is this here?": one sentence under a Ticket's Status saying why it is
 * where it is and what it waits for, its Blockers and holding Conversation
 * linked.
 */
export const WhyHere: FC<WhyHereProps> = ({
  segments,
  ticketHref,
  conversationHref,
}) => (
  <Text tag="p" fontSize="small" color="muted">
    {segments.map((segment, index) => {
      const key = `${index}-${segment.text}`;
      if ('ticket' in segment) {
        return (
          <AppLink key={key} href={ticketHref(segment.ticket)}>
            {segment.text}
          </AppLink>
        );
      }
      if ('conversation' in segment) {
        return (
          <AppLink
            key={key}
            href={conversationHref(segment.conversation)}
            scroll={false}
          >
            {segment.text}
          </AppLink>
        );
      }
      return <span key={key}>{segment.text}</span>;
    })}
  </Text>
);
