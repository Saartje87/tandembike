'use client';

import { Text } from '@blockle/blocks';
import { type FC, useEffect, useState } from 'react';

import {
  currentMachineRuns,
  type MachineRunsState,
} from '../../app/settings/actions';
import { useConversationRevision } from '../live-updates/live-updates';

const usd = (amount: number): string => `$${amount.toFixed(2)}`;

/**
 * "Runs 1 working · 2 waiting on you / 3" for the app header (ADR 0041,
 * T1332): the live Agent processes Autopilot's headroom counts, split into
 * those working and those waiting on the User, against the machine cap.
 * The waiting part shows only when a run waits. It loads when it mounts and again on
 * every Conversation or machine settings change `LiveUpdates` hears of; until
 * the first load it shows nothing. With a Machine ceiling set it also shows
 * today's Autopilot spend against it, and "paused: machine ceiling" at it.
 * Its text is white, as the header is primary-coloured in both Colour modes.
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
  const { budget } = runs;
  return (
    <>
      <Text
        color="white"
        fontSize="small"
        title="Live runs, working and waiting on you, against the machine cap"
      >{`Runs ${runs.working} working${runs.waiting > 0 ? ` · ${runs.waiting} waiting on you` : ''} / ${runs.cap}`}</Text>
      {budget && (
        <Text
          color="white"
          fontSize="small"
          title="Autopilot's spend today against the machine ceiling"
        >{`Spend ${usd(budget.spend)}/${usd(budget.ceiling)}`}</Text>
      )}
      {budget?.paused && (
        <Text color="white" fontSize="small" role="status">
          paused: machine ceiling
        </Text>
      )}
    </>
  );
};
