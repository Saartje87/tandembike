'use client';

import { Alert, Button, Inline, Stack, Text } from '@blockle/blocks';
import { type FC, useState } from 'react';

import { startSetup } from '../../app/conversations/actions';
import type { Conversation } from '../../conversations/conversations';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { stateNames } from '../conversation-labels/conversation-labels';
import { latestSetup } from './latest-setup';

/** Which setting the User just turned on: it offers to run Setup. */
export type SetupOffer = 'agent-mode' | 'parallel-runs';

const offerWords: Record<SetupOffer, string> = {
  'agent-mode': 'Agent mode is on.',
  'parallel-runs': 'Parallel runs is on.',
};

export type ProjectSetupProps = {
  projectId: number;
  agentMode: boolean;
  /** The setting the User just turned on, which offers Setup. */
  offer: SetupOffer | null;
  /** The latest Setup the page loaded; the dialog may know a newer one. */
  latestSetup: Conversation | null;
};

/**
 * Setup in a Project's agent settings (ADR 0020): Run Setup, a hint while
 * none was held, and the running or latest Setup. The Conversation itself,
 * with its replies and Allow/Deny prompts, is the Conversation dialog's:
 * this only opens it. Setup is advisory and gates nothing.
 */
export const ProjectSetup: FC<ProjectSetupProps> = ({
  projectId,
  agentMode,
  offer,
  latestSetup: loadedSetup,
}) => {
  const dialog = useConversationDialog();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  if (!agentMode) {
    return null;
  }

  const latest = latestSetup(
    projectId,
    loadedSetup,
    dialog.conversations.map(({ conversation }) => conversation),
  );

  const run = async () => {
    setPending(true);
    setError(undefined);
    const result = await startSetup({ projectId });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    dialog.open(result.conversation.id);
  };

  const open = async () => {
    if (latest) {
      setError(await dialog.reopenAndOpen(latest));
    }
  };

  const message = offer
    ? `${offerWords[offer]} Run Setup to check the repository is ready.`
    : latest === null
      ? "This repository has not been checked by Setup. Setup looks for what Tandembike's Agent runs rely on and offers to add what is missing. It is optional."
      : null;

  return (
    <Stack gap={2} aria-label="Setup" asChild>
      <section>
        {message && (
          <Text tag="p" fontSize="small" color="muted">
            {message}
          </Text>
        )}
        {latest && (
          <Text tag="p" fontSize="small" color="muted">
            {`Latest Setup: ${stateNames[latest.state]}.`}
          </Text>
        )}
        {error && <Alert intent="danger">{error}</Alert>}
        <Inline gap={2}>
          <Button type="button" size="small" loading={pending} onClick={run}>
            Run Setup
          </Button>
          {latest && (
            <Button type="button" size="small" onClick={open}>
              Open Setup
            </Button>
          )}
        </Inline>
      </section>
    </Stack>
  );
};
