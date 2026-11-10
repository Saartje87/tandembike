'use client';

import { Alert, Button, Inline, Stack } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { startConversation } from '../../app/conversations/actions';
import { callAction } from '../../app/lib/call-action';
import {
  type AgentCommandIntent,
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
  /**
   * Whether to show Spec: an Intake Ticket or an Epic without children
   * (T1222).
   */
  specAvailable?: boolean;
  /** Called with the id of the Conversation a click started. */
  onStarted?: (conversationId: number) => void;
  /** Called when Ask is clicked: the caller opens a draft (T611). */
  onAsk?: () => void;
};

/**
 * Start, Triage, Spec and Ask on a Ticket (ADR 0019). Spec shows when
 * `specAvailable`. Start, Triage and Spec begin a Conversation at once with
 * the command of their Stage and the Ticket number: the Project's own, or
 * the Playbook's ("/tandembike:implement T42") when it has none (T621,
 * T1218). Ask opens a draft tab for the User's own question, through
 * `onAsk`. A refusal, such as the Start run limit, shows its reason.
 */
export const TicketAgentActions: FC<TicketAgentActionsProps> = ({
  ticketNumber,
  ticketType,
  commands,
  specAvailable = false,
  onStarted,
  onAsk,
}) => {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const begin = (intent: AgentCommandIntent) => () => {
    const prompt = agentCommandMessage(
      intent,
      { number: ticketNumber, type: ticketType },
      commands,
    );
    setError(undefined);
    startTransition(async () => {
      const result = await callAction(
        () => startConversation({ ticketNumber, intent, prompt }),
        'The run could not be started. Try again.',
      );
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
        {specAvailable && (
          <Button
            type="button"
            size="small"
            variant="outline"
            disabled={pending}
            onClick={begin('spec')}
          >
            Spec
          </Button>
        )}
        <Button type="button" size="small" variant="outline" onClick={onAsk}>
          Ask
        </Button>
      </Inline>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
