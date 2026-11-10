import { type AnyColumn, type SQL, sql } from 'drizzle-orm';

import { tickets } from '../db/schema';

/** The columns of the Blocker's Ticket row, from `tickets` or an alias of it. */
type BlockerColumns = {
  status: AnyColumn;
  archived: AnyColumn;
  epicNumber: AnyColumn;
};

/**
 * The condition, never null, for a Blocker row `blocker` that no longer
 * holds back a Ticket in Epic `blockedEpicNumber` (null outside an Epic):
 * `blockerResolved` in `blocker-rule.ts` as SQL (T828).
 */
export function resolvedBlockerSql(
  blocker: BlockerColumns,
  blockedEpicNumber: AnyColumn | SQL,
): SQL {
  return sql`(${blocker.status} = 'Done' or ${blocker.archived} = 1 or (
    ${blocker.status} = 'In progress'
    and ${blocker.epicNumber} is not null
    and ${blocker.epicNumber} is ${blockedEpicNumber}
    and exists (
      select 1 from ${tickets} as blocker_epic
      where blocker_epic.number = ${blocker.epicNumber}
        and blocker_epic.claim_agent_run_id is not null
    )
  ))`;
}
