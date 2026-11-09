import { eq } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { machineSettings } from '../db/schema';
import type { ChangeChannel } from './changes';
import { throwFieldErrors } from './rules';

/** The settings of the whole machine, not of one Project (ADR 0041). */
export type MachineSettings = {
  /** The most working runs the factory holds at once, across Projects; at least 1. */
  maxConcurrentRuns: number;
};

export type SetMachineSettingsInput = Partial<MachineSettings>;

export const defaultMaxConcurrentRuns = 3;

/** The single row of machine settings is stored under this id. */
const rowId = 1;

export function createMachineSettings(
  db: DatabaseConnection,
  changes: ChangeChannel,
) {
  const read = (): MachineSettings => {
    const row = db
      .select({ maxConcurrentRuns: machineSettings.maxConcurrentRuns })
      .from(machineSettings)
      .where(eq(machineSettings.id, rowId))
      .get();
    return row ?? { maxConcurrentRuns: defaultMaxConcurrentRuns };
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
      throwFieldErrors({
        maxConcurrentRuns:
          Number.isInteger(maxConcurrentRuns) && maxConcurrentRuns >= 1
            ? undefined
            : 'Enter a whole number of at least 1.',
      });
      db.insert(machineSettings)
        .values({ id: rowId, maxConcurrentRuns })
        .onConflictDoUpdate({
          target: machineSettings.id,
          set: { maxConcurrentRuns },
        })
        .run();
      changes.publish({ type: 'machine' });
      return read();
    },
  };
}
