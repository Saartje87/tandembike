import { Box, Text } from '@blockle/blocks';
import type { FC } from 'react';

import type { ActivityEntry as Entry } from '../../tickets/activity';
import type { ActivityChange } from '../../tickets/activity-change';
import { claimOwner } from '../../tickets/claim-owner';
import { RelativeTime } from '../relative-time/relative-time';

/** Who acted, as the timeline names them, for comments and Activity alike. */
export const actorNames: Record<Entry['actor'], string> = {
  user: 'User',
  agent: 'Agent',
};

/** One change as a phrase that follows who made it. */
function describeChange(change: ActivityChange): string {
  switch (change.type) {
    case 'created':
      return 'created this Ticket';
    case 'status':
      return `changed the Status from ${change.from} to ${change.to}`;
    case 'project':
      return `moved it from ${change.from.name} to ${change.to.name}`;
    case 'title':
      return `renamed it from “${change.from}” to “${change.to}”`;
    case 'description':
      return 'edited the description';
    case 'color':
      return `changed the colour from ${change.from ?? 'none'} to ${change.to ?? 'none'}`;
    case 'origin':
      return change.from === null
        ? `set the Origin to T${change.to}`
        : change.to === null
          ? `cleared the Origin T${change.from}`
          : `changed the Origin from T${change.from} to T${change.to}`;
    case 'labelAdded':
      return `added the label ${change.label}`;
    case 'labelRemoved':
      return `removed the label ${change.label}`;
    case 'blockedByAdded':
      return `added Blocker T${change.number}`;
    case 'blockedByRemoved':
      return `removed Blocker T${change.number}`;
    case 'blocksAdded':
      return `made it block T${change.number}`;
    case 'blocksRemoved':
      return `stopped it blocking T${change.number}`;
    case 'archived':
      return 'archived it';
    case 'restored':
      return 'restored it';
    case 'claimTaken':
      return `claimed it for ${claimOwner(change.agentRunId, change.agentName)}`;
    case 'claimReleased':
      return `released the Claim of ${claimOwner(change.agentRunId, change.agentName)}`;
    case 'claimCleared':
      return `cleared the Claim of ${claimOwner(change.agentRunId, change.agentName)}`;
    case 'criterionChecked':
      return `checked “${change.text}”`;
    case 'criterionUnchecked':
      return `unchecked “${change.text}”`;
    case 'criteriaEdited':
      return 'edited the acceptance criteria';
  }
}

export type ActivityEntryProps = { entry: Entry };

/**
 * One Activity entry as a muted line in a Ticket's timeline: who acted,
 * every change they made, and how long ago.
 */
export const ActivityEntry: FC<ActivityEntryProps> = ({ entry }) => (
  <Box asChild paddingInline={3}>
    <li>
      <Text tag="p" fontSize="small" color="text-600">
        <Text tag="strong" fontWeight="strong">
          {actorNames[entry.actor]}
        </Text>{' '}
        {entry.changes.map(describeChange).join(', ')} ·{' '}
        <RelativeTime date={entry.createdAt} />
      </Text>
    </li>
  </Box>
);
