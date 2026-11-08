import { Tag } from '@blockle/blocks';
import type { FC } from 'react';

import { Icon } from '../icon/icon';

/** A pill that says the Ticket is blocked by an unresolved Blocker. */
export const BlockedMarker: FC = () => (
  <Tag
    intent="warning"
    startSlot={<Icon name="lock-closed" size="small" />}
    role="img"
    aria-label="Blocked by an unresolved Ticket"
  >
    Blocked
  </Tag>
);
