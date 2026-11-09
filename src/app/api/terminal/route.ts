import { appConversations } from '../../../conversations/app-conversations';
import type { TerminalIntent } from '../../../conversations/terminal-shared';
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
      intent?: TerminalIntent;
    }
  | { action: 'next'; folder: string }
  | { action: 'plan'; folder: string; goal: string }
  | { action: 'resume'; conversationId: number }
  | { action: 'end'; conversationId: number; exitCode: number }
  | { action: 'heartbeat'; conversationId: number };

const text = (message: string, status: number) =>
  new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });

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
      case 'start':
        return Response.json(
          await conversations.startTerminal({
            ticketNumber: Number(body.ticketNumber),
            intent: body.intent ?? 'start',
          }),
        );
      case 'next':
        return Response.json(
          await conversations.startTerminalNext(String(body.folder)),
        );
      case 'plan':
        return Response.json(
          await conversations.startTerminalPlan({
            folder: String(body.folder),
            goal: String(body.goal ?? ''),
          }),
        );
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
