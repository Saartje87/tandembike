import { eq } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { conversationUsage } from '../db/schema';
import {
  addTokens,
  noTokens,
  type UsageByModel,
} from '../footprint/token-usage';

/**
 * The tokens Conversation `conversationId`'s runs used, per model (ADR 0050);
 * empty when none was recorded. Only the Conversations module calls it.
 */
export function readUsage(
  db: DatabaseConnection,
  conversationId: number,
): UsageByModel {
  const rows = db
    .select()
    .from(conversationUsage)
    .where(eq(conversationUsage.conversationId, conversationId))
    .all();
  return Object.fromEntries(
    rows.map((row) => [
      row.model,
      {
        input: row.inputTokens,
        output: row.outputTokens,
        cacheWrite: row.cacheWriteTokens,
        cacheRead: row.cacheReadTokens,
      },
    ]),
  );
}

/**
 * Stores the usage of Conversation `conversationId` as `before`, its usage
 * when the run started, plus `run`, the running total the run reported: the
 * way its cost adds up across resumes (ADR 0050).
 */
export function writeUsage(
  db: DatabaseConnection,
  conversationId: number,
  before: UsageByModel,
  run: UsageByModel,
) {
  for (const [model, tokens] of Object.entries(run)) {
    const total = addTokens(before[model] ?? noTokens, tokens);
    const values = {
      inputTokens: total.input,
      outputTokens: total.output,
      cacheWriteTokens: total.cacheWrite,
      cacheReadTokens: total.cacheRead,
    };
    db.insert(conversationUsage)
      .values({ conversationId, model, ...values })
      .onConflictDoUpdate({
        target: [conversationUsage.conversationId, conversationUsage.model],
        set: values,
      })
      .run();
  }
}
