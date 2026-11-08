'use client';

import { Alert, Button, Inline, Stack, Text } from '@blockle/blocks';
import { useRouter } from 'next/navigation';
import { type FC, useState, useTransition } from 'react';

import { startRetro } from '../../app/conversations/actions';
import { archiveCycle } from '../../app/cycles/actions';
import { projectPath } from '../../app/lib/paths';
import type { Conversation } from '../../conversations/conversations';
import type { Cycle } from '../../tickets/cycles';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { archiveCycleConfirmation } from '../cycle-header/archive-cycle-confirmation';

export type CycleCompleteBannerProps = {
  cycle: Pick<Cycle, 'id' | 'projectId' | 'title'>;
  /** The Cycle's Retro the page loaded, closed or not; null when it has none. */
  retro: Conversation | null;
};

/**
 * Tells the User that every Ticket in the Active Cycle is Done and offers to
 * archive it. It never archives by itself: that is the User's planning
 * decision (ADR 0010). Archiving asks the same confirmation as the Cycle
 * header, then goes to the Project's Backlog. Start Retro starts the Cycle's
 * Retro Conversation and opens it; with one already, Open Retro opens it.
 */
export const CycleCompleteBanner: FC<CycleCompleteBannerProps> = ({
  cycle,
  retro: loadedRetro,
}) => {
  const dialog = useConversationDialog();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  // The dialog may know a Retro started since the page loaded.
  const retro =
    dialog.conversations
      .map(({ conversation }) => conversation)
      .find(
        (conversation) =>
          conversation.intent === 'retro' &&
          conversation.retroCycleId === cycle.id,
      ) ?? loadedRetro;

  const retroAction = () => {
    setError(undefined);
    startTransition(async () => {
      if (retro) {
        setError(await dialog.reopenAndOpen(retro));
        return;
      }
      const result = await startRetro({ cycleId: cycle.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dialog.open(result.conversation.id);
    });
  };

  const archive = () => {
    if (!window.confirm(archiveCycleConfirmation(cycle.title))) {
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await archiveCycle({ cycleId: cycle.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(projectPath(cycle.projectId));
    });
  };

  return (
    <Stack gap={2}>
      <Alert intent="success">
        <Inline gap={3} alignY="center" justifyContent="space-between">
          <Text>
            Every Ticket in "{cycle.title}" is Done: the Cycle is complete.
          </Text>
          <Inline gap={2}>
            <Button
              type="button"
              size="small"
              disabled={pending}
              onClick={retroAction}
            >
              {retro ? 'Open Retro' : 'Start Retro'}
            </Button>
            <Button
              type="button"
              size="small"
              disabled={pending}
              onClick={archive}
            >
              Archive Cycle
            </Button>
          </Inline>
        </Inline>
      </Alert>
      {error && <Alert intent="danger">{error}</Alert>}
    </Stack>
  );
};
