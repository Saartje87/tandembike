import { countDistinct, eq, type SQL, sql } from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import { conversations, conversationUsage } from '../db/schema';
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

/** The tokens of a set of Conversations, and how many of them were not measured (ADR 0050). */
export type UsageTotal = {
  usage: UsageByModel;
  /** How many Conversations the total covers, not measured ones included. */
  conversations: number;
  /** How many of them recorded no tokens, left out of `usage`. */
  notMeasured: number;
};

/** The usage of the Conversations `where` selects, summed per model. */
export function totalUsage(
  db: DatabaseConnection,
  where: SQL | undefined,
): UsageTotal {
  const counts = db
    .select({
      conversations: countDistinct(conversations.id),
      measured: countDistinct(conversationUsage.conversationId),
    })
    .from(conversations)
    .leftJoin(
      conversationUsage,
      eq(conversationUsage.conversationId, conversations.id),
    )
    .where(where)
    .get();
  const rows = db
    .select({
      model: conversationUsage.model,
      input: sql<number>`sum(${conversationUsage.inputTokens})`,
      output: sql<number>`sum(${conversationUsage.outputTokens})`,
      cacheWrite: sql<number>`sum(${conversationUsage.cacheWriteTokens})`,
      cacheRead: sql<number>`sum(${conversationUsage.cacheReadTokens})`,
    })
    .from(conversationUsage)
    .innerJoin(
      conversations,
      eq(conversations.id, conversationUsage.conversationId),
    )
    .where(where)
    .groupBy(conversationUsage.model)
    .all();
  const total = counts?.conversations ?? 0;
  return {
    usage: Object.fromEntries(
      rows.map(({ model, ...tokens }) => [model, tokens]),
    ),
    conversations: total,
    notMeasured: total - (counts?.measured ?? 0),
  };
}
