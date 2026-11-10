'use server';

import { appAutopilot } from '../../autopilot/app-autopilot';
import type { PermissionAnswer } from '../../conversations/agent-runner';
import { appConversations } from '../../conversations/app-conversations';
import {
  type ConversationActivity,
  conversationActivity,
} from '../../conversations/conversation-activity';
import type {
  Conversation,
  OpenConversation,
  StartConversationInput,
  TranscriptEntry,
} from '../../conversations/conversations';
import { TicketsError, ValidationError } from '../../tickets/errors';
import type { ActionResult } from '../lib/action-result';

/**
 * Runs start, receive replies and stop only through these Server Actions,
 * whose origin Next checks (ADR 0019). No MCP tool may call the Conversations
 * module, and the only route handler that does is the CLI's terminal route
 * (ADR 0039). Progress reaches browsers as `conversation`
 * changes over the events route, so no path is revalidated here.
 */
async function conversationResult(
  run: () => Promise<Conversation>,
): Promise<ActionResult<{ conversation: Conversation }>> {
  try {
    return { ok: true, conversation: await run() };
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

/** Starts a Conversation on a Ticket or a Project, with its first message. */
export async function startConversation(
  // The browser never says who starts: only the User does, by this action.
  input: Omit<StartConversationInput, 'startedBy'>,
): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().start({
      ...(input?.projectId === undefined
        ? {}
        : { projectId: Number(input.projectId) }),
      ...(input?.ticketNumber === undefined
        ? {}
        : { ticketNumber: Number(input.ticketNumber) }),
      intent: input?.intent,
      prompt: String(input?.prompt ?? ''),
      startedBy: 'user',
      ...(input?.defaults === undefined ? {} : { defaults: input.defaults }),
    }),
  );
}

/**
 * The User approves the merge of a Ticket or Epic in Review (ADR 0038): the
 * Start Conversation that waits resumes with the fixed reply, or a Merge
 * Conversation starts. A refusal names why.
 */
export async function approveMerge(input: {
  number: number;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().approveMerge({ ticketNumber: Number(input?.number) }),
  );
}

/** The User's first message of a Setup: the Agent's brief holds the checklist. */
const setupPrompt =
  "Check that this repository is ready for Tandembike's Agent runs.";

/**
 * Starts a Setup Conversation about a Project, or returns its running one
 * (ADR 0020). Setup is startable only here, from the Project's agent settings.
 */
export async function startSetup(input: {
  projectId: number;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().start({
      projectId: Number(input?.projectId),
      intent: 'setup',
      prompt: setupPrompt,
      startedBy: 'user',
    }),
  );
}

/**
 * Starts the Retro of a Cycle from the Cycle complete banner. Refused when
 * the Cycle already has one.
 */
export async function startRetro(input: {
  cycleId: number;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().startRetro({ cycleId: Number(input?.cycleId) }),
  );
}

/**
 * Starts a Plan Conversation on a goal from the Plan button (T1248): it
 * proposes a Prepared Cycle from the Backlog. Only the User starts one.
 */
export async function startPlan(input: {
  projectId: number;
  goal: string;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().startPlan({
      projectId: Number(input?.projectId),
      goal: String(input?.goal ?? ''),
    }),
  );
}

/**
 * Starts a Batch triage of a Board, a Cycle's id or null for the Backlog
 * (T1318): its Batch-triage Tickets, as Autopilot's rule reads them now,
 * become the Conversation's fixed list. With one open for the Board, returns
 * it and starts nothing (ADR 0047).
 */
export async function startBatchTriage(input: {
  projectId: number;
  cycleId: number | null;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  const projectId = Number(input?.projectId);
  const cycleId = input?.cycleId == null ? null : Number(input.cycleId);
  return conversationResult(() =>
    appConversations().startBatchTriage({
      projectId,
      cycleId,
      ticketNumbers: appAutopilot().batchTriageTickets(projectId, cycleId),
    }),
  );
}

/** Sends the User's reply into a Conversation, resuming it if its run ended. */
export async function replyToConversation(input: {
  conversationId: number;
  text: string;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().reply(
      Number(input?.conversationId),
      String(input?.text ?? ''),
      'user',
    ),
  );
}

/** Stops a Conversation's run. */
export async function stopConversation(input: {
  conversationId: number;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().stop(Number(input?.conversationId)),
  );
}

/**
 * Allows, always allows (saving the rules the run proposed) or denies a
 * permission request a run is waiting on.
 */
export async function answerConversationPermission(input: {
  entryId: number;
  answer: PermissionAnswer;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().answerPermission(Number(input?.entryId), input?.answer),
  );
}

/**
 * Answers a Widget a run is waiting on (ADR 0045): its own kind of answer,
 * `{ other }` or `{ skipped: true }`, which the Conversations module checks.
 */
export async function answerConversationWidget(input: {
  conversationId: number;
  entryId: number;
  answer: unknown;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().answerWidget(
      Number(input?.conversationId),
      Number(input?.entryId),
      input?.answer,
    ),
  );
}

/** Stops a Conversation's run and closes it; its transcript stays. */
export async function closeConversation(input: {
  conversationId: number;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().close(Number(input?.conversationId)),
  );
}

/** Removes the kept worktree of a Conversation, once the User confirmed. */
export async function removeConversationWorktree(input: {
  conversationId: number;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().removeWorktree(Number(input?.conversationId)),
  );
}

/** Opens a closed Conversation again. */
export async function reopenConversation(input: {
  conversationId: number;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().reopen(Number(input?.conversationId)),
  );
}

/** Every open Conversation of the app, for the Conversation dialog's tabs. */
export async function listOpenConversations(): Promise<OpenConversation[]> {
  return appConversations().listOpen();
}

/** A Conversation with its transcript, for the tab the dialog shows. */
export async function loadConversation(input: {
  conversationId: number;
}): Promise<
  ActionResult<{ conversation: Conversation; transcript: TranscriptEntry[] }>
> {
  try {
    const conversations = appConversations();
    const id = Number(input?.conversationId);
    return {
      ok: true,
      conversation: conversations.get(id),
      transcript: conversations.transcript(id),
    };
  } catch (error) {
    if (error instanceof TicketsError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

/**
 * What the Conversations of every Project are doing now, for the Ticket
 * cards and the header. It only reads, and starts nothing.
 */
export async function currentConversationActivity(): Promise<ConversationActivity> {
  return conversationActivity(appConversations().activityRows());
}
