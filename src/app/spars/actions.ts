'use server';

import { appSpars } from '../../spars/app-spars';
import type { Canvas, CanvasOp } from '../../spars/canvas';
import type { Spar } from '../../spars/spars';
import { TicketsError, ValidationError } from '../../tickets/errors';
import type { ActionResult } from '../lib/action-result';

/**
 * Runs a Spar action and wraps it as an `ActionResult`. Progress reaches
 * browsers as `spar` and `conversation` changes over the events route, so no
 * path is revalidated here.
 */
async function sparResult<T extends object>(
  run: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await run()) };
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: error.fieldErrors,
      };
    }
    if (error instanceof TicketsError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

/**
 * Starts a Spar about a Project, or about one of its Tickets with
 * `focusTicketNumber`, with an optional topic. Only the User starts a Spar,
 * by this action (ADR 0046).
 */
export async function startSpar(input: {
  projectId: number;
  focusTicketNumber?: number | null;
  topic?: string;
}): Promise<ActionResult<{ spar: Spar }>> {
  return sparResult(async () => ({
    spar: await appSpars().startSpar({
      projectId: Number(input?.projectId),
      focusTicketNumber:
        input?.focusTicketNumber == null
          ? null
          : Number(input.focusTicketNumber),
      topic: String(input?.topic ?? ''),
    }),
  }));
}

/**
 * The User's edits of a Spar's Canvas, authored by the User, all or
 * nothing. Returns the Canvas as saved; a refusal, such as a closed Spar or
 * a Column that still holds Stickies, says why.
 */
export async function editSparCanvas(input: {
  sparId: number;
  ops: CanvasOp[];
}): Promise<ActionResult<{ canvas: Canvas }>> {
  return sparResult(async () => ({
    canvas: appSpars().editCanvas(
      Number(input?.sparId),
      Array.isArray(input?.ops) ? input.ops : [],
      'user',
    ),
  }));
}
