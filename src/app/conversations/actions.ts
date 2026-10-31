'use server';

import { appConversations } from '../../conversations/app-conversations';
import {
  type ConversationActivity,
  conversationActivity,
} from '../../conversations/conversation-activity';
import type {
  Conversation,
  StartConversationInput,
} from '../../conversations/conversations';
import { TicketsError, ValidationError } from '../../tickets/errors';
import type { ActionResult } from '../lib/action-result';

/**
 * Runs start, receive replies and stop only through these Server Actions,
 * whose origin Next checks (ADR 0019). No route handler or MCP tool may call
 * the Conversations module. Progress reaches browsers as `conversation`
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
  input: StartConversationInput,
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
      ...(input?.defaults === undefined ? {} : { defaults: input.defaults }),
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

/** Allows or denies a permission request a run is waiting on. */
export async function answerConversationPermission(input: {
  entryId: number;
  allow: boolean;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().answerPermission(
      Number(input?.entryId),
      input?.allow === true,
    ),
  );
}

/** Stops a Conversation's run and hides it from the Project's list. */
export async function closeConversation(input: {
  conversationId: number;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().close(Number(input?.conversationId)),
  );
}

/**
 * What the Conversations of every Project are doing now, for the Ticket
 * cards and the header. It only reads, and starts nothing.
 */
export async function currentConversationActivity(): Promise<ConversationActivity> {
  return conversationActivity(appConversations().list());
}
