import { Heading, Inline, Stack, Text } from '@blockle/blocks';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { type FC, Suspense } from 'react';

import { AppLink } from '../../../../../components/app-link/app-link';
import { PageLoading } from '../../../../../components/page-loading/page-loading';
import { SparCanvas } from '../../../../../components/spar-canvas/spar-canvas';
import { SparCloseButton } from '../../../../../components/spar-close-button/spar-close-button';
import { SparHandOffCard } from '../../../../../components/spar-hand-off-card/spar-hand-off-card';
import { SparView } from '../../../../../components/spar-view/spar-view';
import { SparWriteUp } from '../../../../../components/spar-write-up/spar-write-up';
import { appConversations } from '../../../../../conversations/app-conversations';
import { conversationFootprint } from '../../../../../footprint/app-footprint';
import { appSpars } from '../../../../../spars/app-spars';
import type { Spar } from '../../../../../spars/spars';
import { appTickets } from '../../../../../tickets/app-tickets';
import { NotFoundError } from '../../../../../tickets/errors';
import { ticketByNumberPath } from '../../../../lib/paths';
import { loadProject } from '../../project-data';

type SparPageProps = {
  params: Promise<{ id: string; sparId: string }>;
};

/** The Spar of the `[sparId]` segment, or the not-found page when it is missing or another Project's. */
async function loadSpar(params: SparPageProps['params']) {
  const project = await loadProject(params);
  const sparId = Number((await params).sparId);
  if (!Number.isSafeInteger(sparId)) {
    notFound();
  }
  let spar: Spar;
  try {
    spar = appSpars().getSpar(sparId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
  if (spar.projectId !== project.id) {
    notFound();
  }
  return { project, spar };
}

/** What a Spar is called: its topic, else its focus Ticket, else "Spar". */
function sparTitle(spar: Spar): string {
  if (spar.topic !== null) {
    return spar.topic;
  }
  if (spar.focusTicketNumber !== null) {
    const ticket = appTickets('user').getTicket(spar.focusTicketNumber);
    return `T${ticket.number} ${ticket.title}`;
  }
  return 'Spar';
}

export async function generateMetadata({
  params,
}: SparPageProps): Promise<Metadata> {
  const { project, spar } = await loadSpar(params);
  return { title: `Spar: ${sparTitle(spar)} · ${project.name}` };
}

async function sparPage(params: SparPageProps['params']) {
  const { spar } = await loadSpar(params);
  const conversations = appConversations();
  const title = sparTitle(spar);
  const outcome =
    spar.outcomeTicketNumber === null
      ? null
      : appTickets('user').getTicket(spar.outcomeTicketNumber);
  return (
    <Stack gap={3}>
      <Inline gap={2} alignY="center" alignX="between">
        <Heading level={2}>Spar: {title}</Heading>
        <SparCloseButton
          sparId={spar.id}
          closed={spar.closed}
          closing={spar.closing}
        />
      </Inline>
      {outcome && (
        <Text tag="p">
          Handed off as{' '}
          <AppLink href={ticketByNumberPath(outcome.number)}>
            T{outcome.number} {outcome.title}
          </AppLink>
        </Text>
      )}
      {spar.handOffDraft && !spar.closed && (
        <SparHandOffCard sparId={spar.id} draft={spar.handOffDraft} />
      )}
      <SparView
        sparId={spar.id}
        closed={spar.closed}
        title={title}
        item={{
          conversation: conversations.get(spar.id),
          transcript: conversations.transcript(spar.id),
          footprint: conversationFootprint(spar.id),
        }}
        canvas={
          <SparCanvas
            sparId={spar.id}
            canvas={appSpars().getCanvas(spar.id)}
            readOnly={spar.closed}
          />
        }
        writeUp={
          <SparWriteUp
            sparId={spar.id}
            writeUp={spar.writeUp}
            readOnly={spar.closed}
          />
        }
      />
    </Stack>
  );
}

/**
 * A Spar's own page (GLOSSARY: Spar), under its Project: the chat beside the
 * Canvas and the Write-up. LiveUpdates refreshes it on every change, so the
 * Agent's turns and edits appear as they happen.
 */
const SparPage: FC<SparPageProps> = ({ params }) => (
  <Suspense fallback={<PageLoading />}>{sparPage(params)}</Suspense>
);

export default SparPage;
