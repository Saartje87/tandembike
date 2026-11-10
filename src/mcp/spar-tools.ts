import { z } from 'zod';

import type { CanvasOp } from '../spars/canvas';
import type { Spars } from '../spars/spars';
import { NotAllowedError, NotFoundError } from '../tickets/errors';
import { respond, type ToolContext } from './tool-shared';

/** What the Spar tools call of the Spars module. */
export type SparTools = Pick<
  Spars,
  'getSpar' | 'getCanvas' | 'editCanvas' | 'updateWriteUp' | 'proposeHandOff'
>;

/** The tools of a Spar run, which change only its own Spar (ADR 0046). */
export const sparToolNames = [
  'get_canvas',
  'edit_canvas',
  'update_write_up',
  'propose_hand_off',
];

const notInSpar = 'This tool works only in a Spar run.';

/**
 * The Spar of the calling run: its `X-Tandembike-Run` is its Conversation's
 * id, which is the Spar's. Refused for any other caller.
 */
const sparOfRun = (spars: SparTools | undefined, runId: string | undefined) => {
  if (!spars || runId === undefined || !/^\d+$/.test(runId)) {
    throw new NotAllowedError(notInSpar);
  }
  try {
    return spars.getSpar(Number(runId)).id;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new NotAllowedError(notInSpar);
    }
    throw error;
  }
};

const id = z.number().int();
const title = z.string().describe('A one-line title, at most 200 characters.');
const index = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('The place to put it, from 0; left out, the end.');

const canvasOp = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('addColumn'), title, index }),
  z.strictObject({ op: z.literal('renameColumn'), columnId: id, title }),
  z.strictObject({
    op: z.literal('moveColumn'),
    columnId: id,
    index: z.number().int().min(0),
  }),
  z.strictObject({ op: z.literal('removeColumn'), columnId: id }),
  z.strictObject({
    op: z.literal('addSticky'),
    columnId: id,
    title,
    note: z.string().nullable().optional().describe('Markdown; null for none.'),
    ticketNumber: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .describe('A Ticket the idea already has work in.'),
    index,
  }),
  z.strictObject({
    op: z.literal('editSticky'),
    stickyId: id,
    title: title.optional(),
    note: z.string().nullable().optional(),
    ticketNumber: z.number().int().positive().nullable().optional(),
  }),
  z.strictObject({
    op: z.literal('moveSticky'),
    stickyId: id,
    columnId: id,
    index,
  }),
  z.strictObject({ op: z.literal('removeSticky'), stickyId: id }),
]);

export const registerSparTools = (
  { registerTool, runId }: ToolContext,
  spars: SparTools | undefined,
): void => {
  registerTool(
    'get_canvas',
    {
      title: 'Get Canvas',
      description:
        "Read the Canvas of your Spar: its Columns in order, each { id, title, stickies }, and each Sticky { id, title, note, author (user or agent), ticketNumber }. Only in a Spar run, for the run's own Spar; refused otherwise. Your next turn's message already says what the User changed since your last turn; read the whole Canvas when that is not enough.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => respond(() => spars?.getCanvas(sparOfRun(spars, runId))),
  );

  registerTool(
    'edit_canvas',
    {
      title: 'Edit Canvas',
      description:
        'Change the Canvas of your Spar with a batch of operations, in order, all or nothing, written by you (author agent): addColumn, renameColumn, moveColumn, removeColumn (refused while it holds Stickies), addSticky, editSticky, moveSticky and removeSticky, naming Columns and Stickies by the ids get_canvas returns. Propose Columns of your own, such as Risks or Option A and Option B, when they fit the conversation. The User sees your edits at once. Only in a Spar run, and refused on a closed Spar. Returns the Canvas.',
      inputSchema: {
        ops: z
          .array(canvasOp)
          .min(1)
          .max(50)
          .describe('The operations, applied in order.'),
      },
    },
    ({ ops }) =>
      respond(() =>
        spars?.editCanvas(sparOfRun(spars, runId), ops as CanvasOp[], 'agent'),
      ),
  );

  const section = (name: string) =>
    z
      .string()
      .max(20_000)
      .optional()
      .describe(
        `The whole ${name} section in Markdown, replacing it; left out, it stays.`,
      );

  registerTool(
    'update_write_up',
    {
      title: 'Update Write-up',
      description:
        'Update the Write-up of your Spar, the outcome the User sees build up beside the Canvas: its Decisions, Open questions and Next steps, each a Markdown section you replace whole, usually as a short list. Give only the sections you change. Record a decision when it lands, and bring all three up to date when the User asks you to summarise. Only in a Spar run, and refused on a closed Spar. Returns the Write-up.',
      inputSchema: {
        decisions: section('Decisions'),
        openQuestions: section('Open questions'),
        nextSteps: section('Next steps'),
      },
    },
    (input) =>
      respond(() =>
        spars?.updateWriteUp(sparOfRun(spars, runId), input, 'agent'),
      ),
  );

  registerTool(
    'propose_hand_off',
    {
      title: 'Propose Hand-off',
      description:
        "Propose the Hand-off of your Spar when you and the User agree: an idea Ticket's title and description, and the path you recommend, ticket (filed for normal triage) or spec (filed and specced at once, for a bigger idea). Build the description from the Write-up: what the idea is, the Decisions and the Open questions; Tandembike adds a link back to the Spar. It files nothing: the User edits the draft on the Spar page and approves it, which files the Ticket. A new proposal replaces the last. Only in a Spar run; refused on a closed Spar or once it was handed off.",
      inputSchema: {
        title: z.string().describe('A one-line title, at most 200 characters.'),
        description: z
          .string()
          .max(50_000)
          .describe("The idea Ticket's description in Markdown."),
        path: z
          .enum(['ticket', 'spec'])
          .describe(
            'Your recommendation: ticket for triage, spec to spec it now.',
          ),
      },
    },
    (draft) =>
      respond(() => spars?.proposeHandOff(sparOfRun(spars, runId), draft)),
  );
};
