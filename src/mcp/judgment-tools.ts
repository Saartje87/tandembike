import { z } from 'zod';

import type { JudgmentIntent } from '../conversations/conversation-state';
import type {
  JudgmentRun,
  QuestionReply,
  QuestionReplyResult,
} from '../conversations/conversations';
import { NotAllowedError } from '../tickets/errors';
import {
  errorResult,
  jsonResult,
  respondTicket,
  type ToolContext,
} from './tool-shared';

/** The comment on the Ticket saying what Auto-reply did, so it shows in its Activity. */
const replyComment = (result: QuestionReplyResult, reason: string): string => {
  const run = `the Start run (Conversation ${result.startConversationId})`;
  const quoted = `> ${result.question}`;
  switch (result.decision) {
    case 'approve':
      return `Auto-reply answered a question of ${run} for you.\n\n${quoted}\n\nIt answered **${result.answer}**: ${reason}`;
    case 'split':
      return `Auto-reply split off a question of ${run}: it asked the run to leave it out and file a follow-up with this Ticket as Origin.\n\n${quoted}\n\nWhy: ${reason}`;
    case 'escalate':
      return `Auto-reply left a question of ${run} for you to answer.\n\n${quoted}\n\nWhy: ${reason}`;
  }
};

export type { JudgmentRun, QuestionReply, QuestionReplyResult };

/** What the judgment tools call of the Conversations module. */
export type JudgmentTools = {
  /** The judgment run of Conversation `id`, or null when it is none. */
  judgmentRunOf: (id: number) => JudgmentRun | null;
  /** Auto-reply's answer to the Widget its Conversation `id` was started for. */
  replyToQuestion: (
    id: number,
    reply: QuestionReply,
  ) => Promise<QuestionReplyResult>;
};

/** The judgment runs' own tools, each refused for any other caller. */
export const judgmentToolNames = ['add_overlap_blocker', 'reply_to_question'];

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

  registerTool(
    'reply_to_question',
    {
      title: 'Reply to question',
      description:
        "Auto-reply only: answer the one Widget question of a Start run this run was started for, once. approve answers with one of the Widget's own answers in `answer`, in its kind's shape (choice: { selected: [labels] }, rank: { order }, scale: { values }, matrix: { positions }): only a recommended option, or the one within scope, that adds, drops or changes no acceptance criterion and that the Reply rules do not reserve for the User. split tells the Start run to leave an out-of-scope matter out and file a follow-up with its Ticket as Origin; you file nothing. escalate leaves the question for the User. Every decision adds a comment on the Ticket with your reason. Refused outside an Auto-reply run, once replied, and when the User answered first: then end your turn.",
      inputSchema: {
        decision: z
          .enum(['approve', 'split', 'escalate'])
          .describe('What you decided.'),
        answer: z
          .unknown()
          .optional()
          .describe("approve only: the Widget's answer, in its kind's shape."),
        reason: z
          .string()
          .min(1)
          .max(2000)
          .describe('Why, in one or two sentences, for the User.'),
      },
    },
    async ({ decision, answer, reason }) => {
      try {
        const run = runOf(judgment, runId, 'auto_reply');
        const reply: QuestionReply =
          decision === 'approve'
            ? { decision, answer, reason }
            : { decision, reason };
        const result = await (judgment as JudgmentTools).replyToQuestion(
          run.conversationId,
          reply,
        );
        tickets.addComment(result.ticketNumber, {
          author: 'agent',
          body: replyComment(result, reason.trim()),
        });
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
