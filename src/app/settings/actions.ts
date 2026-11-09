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
}): Promise<ActionResult<{ settings: MachineSettings }>> {
  return actionResult(() => {
    const settings = appTickets('user').setMachineSettings({
      maxConcurrentRuns: Number(input?.maxConcurrentRuns),
    });
    revalidatePath(settingsPath());
    return { settings };
  });
}

/** The working runs against the cap, for the app header. It only reads. */
export async function currentMachineRuns(): Promise<{
  inUse: number;
  cap: number;
}> {
  return {
    inUse: appConversations().machineSlotsInUse(),
    cap: appTickets('user').getMachineSettings().maxConcurrentRuns,
  };
}
