'use client';

import { Alert, Button, Inline, Stack, Text } from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import { type FC, useState, useTransition } from 'react';

import { archiveCycle } from '../../app/cycles/actions';
import { projectPath } from '../../app/lib/paths';
import type { Cycle } from '../../tickets/cycles';
import { archiveCycleConfirmation } from '../cycle-header/archive-cycle-confirmation';

export type CycleCompleteBannerProps = {
  cycle: Pick<Cycle, 'id' | 'projectId' | 'title'>;
};

/**
 * Tells the User that every Ticket in the Active Cycle is Done and offers to
 * archive it. It never archives by itself: that is the User's planning
 * decision (ADR 0010). Archiving asks the same confirmation as the Cycle
 * header, then goes to the Project's Backlog.
 */
export const CycleCompleteBanner: FC<CycleCompleteBannerProps> = ({
  cycle,
}) => {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const archive = () => {
    if (!window.confirm(archiveCycleConfirmation(cycle.title))) {
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await archiveCycle({ cycleId: cycle.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(projectPath(cycle.projectId));
    });
  };

  return (
    <Stack gap={2}>
      <Alert intent="success">
        <Inline gap={3} alignY="center" justifyContent="space-between">
          <Text>
            Every Ticket in "{cycle.title}" is Done: the Cycle is complete.
          </Text>
          <Button
            type="button"
            size="small"
            disabled={pending}
            onClick={archive}
          >
            Archive Cycle
          </Button>
        </Inline>
      </Alert>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
