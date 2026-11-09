'use client';

import { Text } from '@blockle/blocks';
import { type FC, useEffect, useState } from 'react';

import {
  currentMachineRuns,
  type MachineRunsState,
} from '../../app/settings/actions';
import { useConversationRevision } from '../live-updates/live-updates';

/**
 * "Runs 2/3" for the app header (ADR 0041): the working runs holding a
 * machine slot against the machine cap. It loads when it mounts and again on
 * every Conversation or machine settings change `LiveUpdates` hears of; until
 * the first load it shows nothing. With a Machine ceiling set it also shows
 * today's Autopilot spend against it, and "paused: machine ceiling" at it.
 */
const usd = (amount: number): string => `$${amount.toFixed(2)}`;

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
  const { budget } = runs;
  return (
    <>
      <Text
        fontSize="small"
        title="Working runs against the machine cap"
      >{`Runs ${runs.inUse}/${runs.cap}`}</Text>
      {budget && (
        <Text
          fontSize="small"
          title="Autopilot's spend today against the machine ceiling"
        >{`Spend ${usd(budget.spendUsd)}/${usd(budget.ceilingUsd)}`}</Text>
      )}
      {budget?.paused && (
        <Text fontSize="small" role="status">
          paused: machine ceiling
        </Text>
      )}
    </>
  );
};
