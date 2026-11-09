'use client';

import { Text } from '@blockle/blocks';
import { type FC, useEffect, useState } from 'react';

import { currentMachineRuns } from '../../app/settings/actions';
import { useConversationRevision } from '../live-updates/live-updates';

type MachineRunsState = { inUse: number; cap: number };

/**
 * "Runs 2/3" for the app header (ADR 0041): the working runs holding a
 * machine slot against the machine cap. It loads when it mounts and again on
 * every Conversation or machine settings change `LiveUpdates` hears of; until
 * the first load it shows nothing.
 */
export const MachineRuns: FC = () => {
  const revision = useConversationRevision();
  const [runs, setRuns] = useState<MachineRunsState | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is the trigger to load again.
  useEffect(() => {
    let current = true;
    currentMachineRuns()
      .then((next) => {
        if (current) {
          setRuns(next);
        }
      })
      .catch(() => {
        // Keep what was shown; the next change loads it again.
      });
    return () => {
      current = false;
    };
  }, [revision]);

  if (runs === null) {
    return null;
  }
  return (
    <Text
      fontSize="small"
      title="Working runs against the machine cap"
    >{`Runs ${runs.inUse}/${runs.cap}`}</Text>
  );
};
