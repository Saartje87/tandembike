'use server';

import type { Conversation } from '../../conversations/conversations';
import { appSpars } from '../../spars/app-spars';
import type { Canvas, CanvasOp } from '../../spars/canvas';
import type { HandOffPath } from '../../spars/spar-moves';
import type { Spar, WriteUp } from '../../spars/spars';
import type { AgentKind } from '../../tickets/agent-kind';
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
  /** The Agent kind the User picked; left out for the Project's default. */
  agentKind?: AgentKind;
}): Promise<ActionResult<{ spar: Spar }>> {
  return sparResult(async () => ({
    spar: await appSpars().startSpar({
      projectId: Number(input?.projectId),
      focusTicketNumber:
        input?.focusTicketNumber == null
          ? null
          : Number(input.focusTicketNumber),
      topic: String(input?.topic ?? ''),
      ...(input?.agentKind === undefined ? {} : { agentKind: input.agentKind }),
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

/**
 * Sends the User's message into a Spar with what changed on its Canvas since
 * the Agent's last turn; a blank one is Your move, the changes alone.
 */
export async function sendSparTurn(input: {
  sparId: number;
  text: string;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return sparResult(async () => ({
    conversation: await appSpars().sendTurn(
      Number(input?.sparId),
      String(input?.text ?? ''),
    ),
  }));
}

/** The User's edit of sections of a Spar's Write-up; the others stay. */
export async function updateSparWriteUp(input: {
  sparId: number;
  writeUp: Partial<WriteUp>;
}): Promise<ActionResult<{ writeUp: WriteUp }>> {
  return sparResult(async () => ({
    writeUp: appSpars().updateWriteUp(
      Number(input?.sparId),
      input?.writeUp ?? {},
      'user',
    ),
  }));
}

/**
 * Closes a Spar: it sends Summarise, and closes once that turn ends, its
 * run stopped and its page read-only until reopened.
 */
export async function closeSpar(input: {
  sparId: number;
}): Promise<ActionResult<{ spar: Spar }>> {
  return sparResult(async () => ({
    spar: await appSpars().closeSpar(Number(input?.sparId)),
  }));
}

/** Reopens a closed Spar; the next reply resumes its run. */
export async function reopenSpar(input: {
  sparId: number;
}): Promise<ActionResult<{ spar: Spar }>> {
  return sparResult(async () => ({
    spar: appSpars().reopenSpar(Number(input?.sparId)),
  }));
}

/**
 * The User's approval of a Spar's Hand-off: files the idea Ticket as edited,
 * and with `spec` starts a Spec Conversation on it. Only the User approves,
 * by this action; a Spar's Agent can only draft it.
 */
export async function handOffSpar(input: {
  sparId: number;
  title: string;
  description: string;
  path: HandOffPath;
}): Promise<
  ActionResult<{
    spar: Spar;
    ticketNumber: number;
    conversation: Conversation | null;
    specError: string | null;
  }>
> {
  return sparResult(() =>
    appSpars().handOff(Number(input?.sparId), {
      title: String(input?.title ?? ''),
      description: String(input?.description ?? ''),
      path: input?.path,
    }),
  );
}
