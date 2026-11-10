import { eq } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { footprintFactors } from '../db/schema';
import {
  defaultFootprintFactors,
  type FootprintFactors,
} from '../footprint/footprint';
import { throwFieldErrors } from '../tickets/rules';

/** One of the Footprint factors, by name. */
export type FootprintFactor = keyof FootprintFactors;

/** The single row of Footprint factors is stored under this id. */
const rowId = 1;

const factorNames = Object.keys(defaultFootprintFactors) as FootprintFactor[];

/**
 * The Settings module: app-wide settings that belong to no Project. It holds
 * the Footprint factors (ADR 0050) and is the only code that reads or writes
 * them. Only Server Actions and the app's own reads call it; no MCP tool
 * exposes it.
 */
export function createSettings(db: DatabaseConnection) {
  const read = (): FootprintFactors => {
    const row = db
      .select()
      .from(footprintFactors)
      .where(eq(footprintFactors.id, rowId))
      .get();
    if (!row) {
      return defaultFootprintFactors;
    }
    const { id: _, ...factors } = row;
    return factors;
  };

  const write = (factors: FootprintFactors) => {
    db.insert(footprintFactors)
      .values({ id: rowId, ...factors })
      .onConflictDoUpdate({ target: footprintFactors.id, set: factors })
      .run();
  };

  return {
    /** The Footprint factors; the ADR 0050 defaults until first saved. */
    getFootprintFactors(): FootprintFactors {
      return read();
    },

    /**
     * Saves the Footprint factors given; the others stay as they are. Refuses,
     * saving nothing, a factor that is not a finite number of 0 or more,
     * naming its field.
     */
    setFootprintFactors(input: Partial<FootprintFactors>): FootprintFactors {
      throwFieldErrors(
        Object.fromEntries(
          factorNames.map((name) => {
            const value = input[name];
            return [
              name,
              value === undefined || (Number.isFinite(value) && value >= 0)
                ? undefined
                : 'Enter a number of 0 or more.',
            ];
          }),
        ),
      );
      const factors = { ...read() };
      for (const name of factorNames) {
        factors[name] = input[name] ?? factors[name];
      }
      write(factors);
      return read();
    },

    /** Sets Footprint factor `name` back to its ADR 0050 default. */
    resetFootprintFactor(name: FootprintFactor): FootprintFactors {
      throwFieldErrors({
        name: factorNames.includes(name)
          ? undefined
          : `There is no Footprint factor "${name}".`,
      });
      write({ ...read(), [name]: defaultFootprintFactors[name] });
      return read();
    },
  };
}

export type Settings = ReturnType<typeof createSettings>;
