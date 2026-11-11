'use client';

import { Alert, Button, Inline, Stack } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { startConversation } from '../../app/conversations/actions';
import { callAction } from '../../app/lib/call-action';
import type { AgentCommandIntent } from '../../tickets/agent-commands';

export type TicketAgentActionsProps = {
  ticketNumber: number;
  /**
   * Whether to show Spec: an Intake Ticket or an Epic without children
   * (T1222).
   */
  specAvailable?: boolean;
  /** Called with the id of the Conversation a click started. */
  onStarted?: (conversationId: number) => void;
  /** Called when Ask is clicked: the caller opens a draft (T611). */
  onAsk?: () => void;
  /**
   * Offers Ask only, as for an archived Ticket, which Start, Triage and Spec
   * would change.
   */
  askOnly?: boolean;
};

/**
 * Start, Triage, Spec and Ask on a Ticket (ADR 0019). Spec shows when
 * `specAvailable`. Start, Triage and Spec begin a Conversation at once that
 * invokes their Stage on the Ticket; its runner words it, on Claude Code
 * with the Project's command or the Playbook's ("/tandembike:implement
 * T42", T621, T1218, ADR 0051). Ask opens a draft tab for the User's own question, through
 * `onAsk`. A refusal, such as the Start run limit, shows its reason.
 */
export const TicketAgentActions: FC<TicketAgentActionsProps> = ({
  ticketNumber,
  specAvailable = false,
  onStarted,
  onAsk,
  askOnly = false,
}) => {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const begin = (intent: AgentCommandIntent) => () => {
    setError(undefined);
    startTransition(async () => {
      const result = await callAction(
        () =>
          startConversation({ ticketNumber, intent, stage: { stage: intent } }),
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
        {!askOnly && (
          <>
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
          </>
        )}
        {specAvailable && !askOnly && (
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
