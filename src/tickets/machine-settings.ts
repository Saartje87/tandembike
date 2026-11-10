import { eq } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { machineSettings } from '../db/schema';
import type { ChangeChannel } from './changes';
import { throwFieldErrors } from './rules';

/** The settings of the whole machine, not of one Project (ADR 0041). */
export type MachineSettings = {
  /** The most live runs the factory holds at once, across Projects, idle ones waiting on the User included (ADR 0049); at least 1. */
  maxConcurrentRuns: number;
  /**
   * The most USD Autopilot may spend per local day across all Projects, or
   * null for none (the Machine ceiling, ADR 0041).
   */
  dailySpendCeilingUsd: number | null;
};

export type SetMachineSettingsInput = Partial<MachineSettings>;

export const defaultMaxConcurrentRuns = 3;

const defaults: MachineSettings = {
  maxConcurrentRuns: defaultMaxConcurrentRuns,
  dailySpendCeilingUsd: null,
};

/** The single row of machine settings is stored under this id. */
const rowId = 1;

export function createMachineSettings(
  db: DatabaseConnection,
  changes: ChangeChannel,
) {
  const read = (): MachineSettings => {
    const row = db
      .select({
        maxConcurrentRuns: machineSettings.maxConcurrentRuns,
        dailySpendCeilingUsd: machineSettings.dailySpendCeilingUsd,
      })
      .from(machineSettings)
      .where(eq(machineSettings.id, rowId))
      .get();
    return row ?? defaults;
  };

  return {
    /** The machine settings; the defaults until they are first saved. */
    getMachineSettings(): MachineSettings {
      return read();
    },

    /**
     * Sets the machine settings; fields left out stay as they are. Only a
     * Server Action calls it: no MCP tool exposes it, so no Agent can raise
     * its own limits (ADR 0041).
     */
    setMachineSettings(input: SetMachineSettingsInput): MachineSettings {
      const before = read();
      const maxConcurrentRuns =
        input.maxConcurrentRuns ?? before.maxConcurrentRuns;
      const dailySpendCeilingUsd =
        input.dailySpendCeilingUsd === undefined
          ? before.dailySpendCeilingUsd
          : input.dailySpendCeilingUsd;
      throwFieldErrors({
        dailySpendCeilingUsd:
          dailySpendCeilingUsd === null ||
          (Number.isFinite(dailySpendCeilingUsd) && dailySpendCeilingUsd > 0)
            ? undefined
            : 'Enter an amount in dollars above 0.',
        maxConcurrentRuns:
          Number.isInteger(maxConcurrentRuns) && maxConcurrentRuns >= 1
            ? undefined
            : 'Enter a whole number of at least 1.',
      });
      db.insert(machineSettings)
        .values({ id: rowId, maxConcurrentRuns, dailySpendCeilingUsd })
        .onConflictDoUpdate({
          target: machineSettings.id,
          set: { maxConcurrentRuns, dailySpendCeilingUsd },
        })
        .run();
      changes.publish({ type: 'machine' });
      return read();
    },
  };
}
