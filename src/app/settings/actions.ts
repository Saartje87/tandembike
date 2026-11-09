'use server';

import { revalidatePath } from 'next/cache';

import { appConversations } from '../../conversations/app-conversations';
import { appTickets } from '../../tickets/app-tickets';
import type { MachineSettings } from '../../tickets/machine-settings';
import { type ActionResult, actionResult } from '../lib/action-result';
import { settingsPath } from '../lib/paths';

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

/** What the app header shows of the machine: runs and the Machine ceiling. */
export type MachineRunsState = {
  inUse: number;
  cap: number;
  /** Today's Autopilot spend against the daily ceiling; null without one. */
  budget: { spendUsd: number; ceilingUsd: number; paused: boolean } | null;
};

/** The working runs against the cap and today's spend, for the app header. It only reads. */
export async function currentMachineRuns(): Promise<MachineRunsState> {
  return {
    budget: appConversations().machineBudget(),
    inUse: appConversations().machineSlotsInUse(),
    cap: appTickets('user').getMachineSettings().maxConcurrentRuns,
  };
}
