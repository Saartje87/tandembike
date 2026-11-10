'use server';

import { revalidatePath } from 'next/cache';

import { appConversations } from '../../conversations/app-conversations';
import type { FootprintFactors } from '../../footprint/footprint';
import { appSettings } from '../../settings/app-settings';
import type { FootprintFactor } from '../../settings/settings';
import { appTickets } from '../../tickets/app-tickets';
import type { MachineSettings } from '../../tickets/machine-settings';
import { type ActionResult, actionResult } from '../lib/action-result';
import { settingsPath, statsPath } from '../lib/paths';

/**
 * Saves the machine settings (ADR 0041). Only this Server Action sets them:
 * no MCP tool exposes them, so no Agent can raise its own limits.
 */
export async function saveMachineSettings(input: {
  maxConcurrentRuns: number;
  dailySpendCeilingUsd: number | null;
}): Promise<ActionResult<{ settings: MachineSettings }>> {
  return actionResult(() => {
    const settings = appTickets('user').setMachineSettings({
      maxConcurrentRuns: Number(input?.maxConcurrentRuns),
      dailySpendCeilingUsd:
        input?.dailySpendCeilingUsd === null ||
        input?.dailySpendCeilingUsd === undefined
          ? null
          : Number(input.dailySpendCeilingUsd),
    });
    revalidatePath(settingsPath());
    return { settings };
  });
}

/**
 * Saves the Footprint factors (ADR 0050). Every Footprint is computed from
 * them when read, so the pages that show Footprints are revalidated.
 */
export async function saveFootprintFactors(
  input: FootprintFactors,
): Promise<ActionResult<{ factors: FootprintFactors }>> {
  return actionResult(() => {
    const factors = appSettings().setFootprintFactors({
      haikuWhPerMillion: numberOrNaN(input?.haikuWhPerMillion),
      sonnetWhPerMillion: numberOrNaN(input?.sonnetWhPerMillion),
      opusWhPerMillion: numberOrNaN(input?.opusWhPerMillion),
      gridGramsPerKwh: numberOrNaN(input?.gridGramsPerKwh),
    });
    revalidateFootprints();
    return { factors };
  });
}

/** `value` when it is a number, else NaN, which the Settings module refuses: an empty value is not 0. */
const numberOrNaN = (value: unknown): number =>
  typeof value === 'number' ? value : Number.NaN;

/** Sets one Footprint factor back to its ADR 0050 default. */
export async function resetFootprintFactor(input: {
  name: FootprintFactor;
}): Promise<ActionResult<{ factors: FootprintFactors }>> {
  return actionResult(() => {
    const factors = appSettings().resetFootprintFactor(input?.name);
    revalidateFootprints();
    return { factors };
  });
}

function revalidateFootprints() {
  revalidatePath(settingsPath());
  revalidatePath(statsPath());
}

/** What the app header shows of the machine: runs and the Machine ceiling. */
export type MachineRunsState = {
  /** Live runs working, Terminal sessions included (T1332). */
  working: number;
  /** Live runs waiting on the User: idle, or on a permission or a Widget. */
  waiting: number;
  cap: number;
  /** Today's Autopilot spend against the daily ceiling; null without one. */
  budget: { spendUsd: number; ceilingUsd: number; paused: boolean } | null;
};

/** The live runs holding a slot against the cap and today's spend, for the app header. It only reads. */
export async function currentMachineRuns(): Promise<MachineRunsState> {
  return {
    budget: appConversations().machineBudget(),
    ...appConversations().liveProcesses(),
    cap: appTickets('user').getMachineSettings().maxConcurrentRuns,
  };
}
