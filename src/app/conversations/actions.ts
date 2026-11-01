'use server';

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

/** Answers an Agent's question a run is waiting on, by question text. */
export async function answerConversationQuestion(input: {
  entryId: number;
  answers: Record<string, string>;
}): Promise<ActionResult<{ conversation: Conversation }>> {
  return conversationResult(() =>
    appConversations().answerQuestion(
      Number(input?.entryId),
      Object.fromEntries(
        Object.entries(input?.answers ?? {}).map(([question, answer]) => [
          question,
          String(answer),
        ]),
      ),
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
  return conversationActivity(appConversations().list());
}
