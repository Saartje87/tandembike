'use client';

import { Alert, Button, Inline, Stack } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { startConversation } from '../../app/conversations/actions';
import {
  agentCommandMessage,
  type ProjectAgentCommands,
} from '../../tickets/agent-commands';
import type { TicketType } from '../../tickets/ticket-type';

export type TicketAgentActionsProps = {
  ticketNumber: number;
  /** Whether it is an Epic, whose Start uses the Start command for Epics. */
  ticketType: TicketType;
  /** The commands of the Ticket's Project that Triage and Start send. */
  commands: ProjectAgentCommands;
  /** Called with the id of the Conversation a click started. */
  onStarted?: (conversationId: number) => void;
  /** Called when Ask is clicked: the caller opens a draft (T611). */
  onAsk?: () => void;
};

/**
 * Start, Triage and Ask on a Ticket (ADR 0019). Start and Triage begin a
 * Conversation at once with the Project's command and the Ticket number
 * ("/mattpocock-skills:implement T42"), or a plain "Start T42" when it has
 * none (T621); Ask opens a draft tab for the User's own question, through
 * `onAsk`. A refusal, such as the Start run limit, shows its reason.
 */
export const TicketAgentActions: FC<TicketAgentActionsProps> = ({
  ticketNumber,
  ticketType,
  commands,
  onStarted,
  onAsk,
}) => {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const begin = (intent: 'start' | 'triage') => () => {
    const prompt = agentCommandMessage(
      intent,
      { number: ticketNumber, type: ticketType },
      commands,
    );
    setError(undefined);
    startTransition(async () => {
      const result = await startConversation({ ticketNumber, intent, prompt });
      if (result.ok) {
        onStarted?.(result.conversation.id);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Stack gap={2}>
      <Inline gap={2}>
        <Button
          type="button"
          size="small"
          disabled={pending}
          onClick={begin('start')}
        >
          Start
        </Button>
        <Button
          type="button"
          size="small"
          variant="outline"
          disabled={pending}
          onClick={begin('triage')}
        >
          Triage
        </Button>
        <Button type="button" size="small" variant="outline" onClick={onAsk}>
          Ask
        </Button>
      </Inline>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
