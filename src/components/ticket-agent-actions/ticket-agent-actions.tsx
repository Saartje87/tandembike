'use client';

import { Alert, Button, Inline, Stack } from '@blockle/blocks';
import { type FC, useState, useTransition } from 'react';

import { startConversation } from '../../app/conversations/actions';
import type { ConversationIntent } from '../../conversations/conversation-state';
import { MessageForm } from '../message-form/message-form';

export type TicketAgentActionsProps = {
  ticketNumber: number;
  /** Called with the id of the Conversation a click started. */
  onStarted?: (conversationId: number) => void;
};

/**
 * Start, Triage and Ask on a Ticket (ADR 0019). Start and Triage begin a
 * Conversation at once with a minimal message ("Start T42"); Ask opens a
 * field for the User's own question. A refusal, such as the Start run limit,
 * shows its reason.
 */
export const TicketAgentActions: FC<TicketAgentActionsProps> = ({
  ticketNumber,
  onStarted,
}) => {
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string>();

  const begin = (intent: ConversationIntent, prompt: string) => () => {
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
          onClick={begin('start', `Start T${ticketNumber}`)}
        >
          Start
        </Button>
        <Button
          type="button"
          size="small"
          variant="outline"
          disabled={pending}
          onClick={begin('triage', `Triage T${ticketNumber}`)}
        >
          Triage
        </Button>
        <Button
          type="button"
          size="small"
          variant="outline"
          aria-expanded={asking}
          onClick={() => setAsking(true)}
        >
          Ask
        </Button>
      </Inline>
      {error && <Alert intent="danger">{error}</Alert>}
      {asking && (
        <MessageForm
          label="Question"
          onCancel={() => setAsking(false)}
          onSend={async (prompt) => {
            const result = await startConversation({
              ticketNumber,
              intent: 'ask',
              prompt,
            });
            if (!result.ok) {
              return {
                ok: false,
                error: result.error,
                reason: result.fieldErrors?.prompt,
              };
            }
            onStarted?.(result.conversation.id);
            setAsking(false);
            return { ok: true };
          }}
        />
      )}
    </Stack>
  );
};
