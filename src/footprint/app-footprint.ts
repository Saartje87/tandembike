import { appConversations } from '../conversations/app-conversations';
import type { UsageTotal } from '../conversations/usage-store';
import { appSettings } from '../settings/app-settings';
import { appTickets } from '../tickets/app-tickets';
import {
  type Footprint,
  type FootprintFactors,
  footprintOf,
} from './footprint';

/**
 * The Footprint factors every Footprint is computed with, as saved in the
 * Settings module: the one place that supplies them (ADR 0050).
 */
export function footprintFactors(): FootprintFactors {
  return appSettings().getFootprintFactors();
}

/** Conversation `id`'s estimated Footprint, computed when read (ADR 0050). */
export function conversationFootprint(id: number): Footprint {
  return footprintOf(appConversations().usage(id), footprintFactors());
}

const totalOf = ({ usage, notMeasured }: UsageTotal) => ({
  footprint: footprintOf(usage, footprintFactors()),
  notMeasured,
});

/**
 * Project `projectId`'s total Footprint of all time and per Cycle, newest
 * Cycle first, leaving out Cycles without Conversations; null when the
 * Project has none (ADR 0050).
 */
export function projectFootprints(projectId: number) {
  const conversations = appConversations();
  const total = conversations.usageTotal({ projectId });
  if (total.conversations === 0) {
    return null;
  }
  const cycles = appTickets('user')
    .listCycles(projectId)
    .map((cycle) => ({
      cycle,
      total: conversations.usageTotal({ projectId, cycleId: cycle.id }),
    }))
    .filter(({ total }) => total.conversations > 0)
    .sort((a, b) => b.cycle.id - a.cycle.id)
    .map(({ cycle, total }) => ({
      cycle: { id: cycle.id, title: cycle.title },
      ...totalOf(total),
    }));
  return { total: totalOf(total), cycles };
}

/**
 * Cycle `cycleId`'s whole Footprint, for the Autopilot bar: every
 * Conversation counting towards it by the Stats per-Cycle rule, hand-started
 * ones included; null when it has none (ADR 0050). Information only.
 */
export function cycleFootprint(
  projectId: number,
  cycleId: number,
): Footprint | null {
  const total = appConversations().usageTotal({ projectId, cycleId });
  return total.conversations === 0 ? null : totalOf(total).footprint;
}
