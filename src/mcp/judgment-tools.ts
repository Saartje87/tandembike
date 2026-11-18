import { z } from 'zod';

import type { JudgmentIntent } from '../conversations/conversation-state';
import type { JudgmentRun } from '../conversations/conversations';
import { NotAllowedError } from '../tickets/errors';
import { respondTicket, type ToolContext } from './tool-shared';

export type { JudgmentRun };

/** What the judgment tools call of the Conversations module. */
export type JudgmentTools = {
  /** The judgment run of Conversation `id`, or null when it is none. */
  judgmentRunOf: (id: number) => JudgmentRun | null;
};

/** The judgment runs' own tools, each refused for any other caller. */
export const judgmentToolNames = ['add_overlap_blocker'];

const notIn: Record<JudgmentIntent, string> = {
  overlap_planning: 'This tool works only in an Overlap planning run.',
  auto_reply: 'This tool works only in an Auto-reply run.',
};

/**
 * The calling run, a judgment run of `intent`: its `X-Tandembike-Run` is its
 * Conversation's id. Refused for any other caller.
 */
const runOf = (
  judgment: JudgmentTools | undefined,
  runId: string | undefined,
  intent: JudgmentIntent,
): JudgmentRun => {
  const run =
    judgment && runId !== undefined && /^\d+$/.test(runId)
      ? judgment.judgmentRunOf(Number(runId))
      : null;
  if (run?.intent !== intent) {
    throw new NotAllowedError(notIn[intent]);
  }
  return run;
};

export const registerJudgmentTools = (
  { registerTool, runId, tickets }: ToolContext,
  judgment: JudgmentTools | undefined,
): void => {
  registerTool(
    'add_overlap_blocker',
    {
      title: 'Add overlap Blocker',
      description:
        "Overlap planning only: block one Active Cycle Ticket or Epic on another that would touch the same code, so they run one after the other. The blocker must be the one higher on the Board. Both must be Todo, unclaimed, unarchived, labelled ready-for-agent and not an Epic child: compare an Epic as a whole. It adds a comment on the blocked Ticket naming the blocker and sharedCode. A Blocker already there is left as it is; a Blocker cycle is refused. It never removes a Blocker. Refused outside an Overlap planning run. Returns the blocked Ticket's summary with blockedBy.",
      inputSchema: {
        blocker: z
          .number()
          .int()
          .positive()
          .describe('The Ticket that goes first: the one higher on the Board.'),
        blocked: z
          .number()
          .int()
          .positive()
          .describe('The Ticket that waits for it.'),
        sharedCode: z
          .string()
          .max(500)
          .describe(
            'The files or modules both would touch, such as `src/board/` or `src/tickets/cycles.ts`.',
          ),
      },
    },
    ({ blocker, blocked, sharedCode }) =>
      respondTicket(
        undefined,
        () => {
          const run = runOf(judgment, runId, 'overlap_planning');
          return tickets.addOverlapBlocker({
            projectId: run.projectId,
            cycleId: run.cycleId as number,
            blocker,
            blocked,
            sharedCode,
          });
        },
        (ticket) => ({ blockedBy: ticket.blockedBy }),
      ),
  );
};
