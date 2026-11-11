import { appConversations } from '../../../conversations/app-conversations';
import type { TerminalProjectRef } from '../../../conversations/conversations';
import {
  choiceIntents,
  isChoiceIntent,
} from '../../../conversations/terminal-choices';
import {
  isTerminalIntent,
  type TerminalIntent,
  terminalIntents,
} from '../../../conversations/terminal-shared';
import { NotFoundError, TicketsError } from '../../../tickets/errors';

/**
 * What the `tandembike` command calls to open and end Terminal Conversations
 * (ADR 0039). A thin, local-only wrapper (ADR 0022): each action maps to one
 * Conversations function, and a refusal returns its message as plain text.
 * Later subcommands add actions here.
 */
type TerminalAction =
  | {
      action: 'start';
      ticketNumber: number;
      intent?: unknown;
    }
  | ({ action: 'next' } & ProjectRefBody)
  | ({ action: 'plan'; goal: string } & ProjectRefBody)
  | { action: 'projects'; folder: string }
  | ({ action: 'list'; intent: unknown } & ProjectRefBody)
  | { action: 'resume'; conversationId: number }
  | { action: 'end'; conversationId: number; exitCode: number }
  | { action: 'heartbeat'; conversationId: number }
  | { action: 'sessions' };

/** A folder, or a Project id, which wins when both are sent. */
type ProjectRefBody = { folder?: string; projectId?: number };

const projectRefOf = (body: ProjectRefBody): TerminalProjectRef =>
  body.projectId === undefined || body.projectId === null
    ? { folder: String(body.folder) }
    : { projectId: Number(body.projectId) };

const text = (message: string, status: number) =>
  new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });

/** The intent a start asks for: Start when left out, null when not one. */
const startIntent = (intent: unknown): TerminalIntent | null => {
  if (intent === undefined || intent === null) return 'start';
  return typeof intent === 'string' && isTerminalIntent(intent) ? intent : null;
};

export const POST = async (request: Request): Promise<Response> => {
  let body: TerminalAction;
  try {
    body = await request.json();
  } catch {
    return text('The request is not JSON.', 400);
  }
  try {
    const conversations = appConversations();
    switch (body?.action) {
      case 'start': {
        const intent = startIntent(body.intent);
        if (!intent) {
          return text(
            `Unknown intent. Use one of: ${terminalIntents.join(', ')}.`,
            400,
          );
        }
        return Response.json(
          await conversations.startTerminal({
            ticketNumber: Number(body.ticketNumber),
            intent,
          }),
        );
      }
      case 'next':
        return Response.json(
          await conversations.startTerminalNext(projectRefOf(body)),
        );
      case 'plan':
        return Response.json(
          await conversations.startTerminalPlan({
            ...projectRefOf(body),
            goal: String(body.goal ?? ''),
          }),
        );
      case 'projects':
        return Response.json(
          conversations.terminalProjects(String(body.folder)),
        );
      case 'list': {
        if (!isChoiceIntent(body.intent)) {
          return text(
            `Unknown intent. Use one of: ${choiceIntents.join(', ')}.`,
            400,
          );
        }
        return Response.json(
          conversations.terminalChoices({
            ...projectRefOf(body),
            intent: body.intent,
          }),
        );
      }
      case 'resume':
        return Response.json(
          await conversations.handOffToTerminal(Number(body.conversationId)),
        );
      case 'end':
        await conversations.endTerminal(Number(body.conversationId), {
          exitCode: Number(body.exitCode),
        });
        return Response.json({ ok: true });
      case 'heartbeat':
        conversations.heartbeatTerminal(Number(body.conversationId));
        return Response.json({ ok: true });
      case 'sessions':
        return Response.json(conversations.openTerminals());
      default:
        return text('Unknown action.', 400);
    }
  } catch (error) {
    if (error instanceof TicketsError) {
      return text(error.message, error instanceof NotFoundError ? 404 : 409);
    }
    throw error;
  }
};
