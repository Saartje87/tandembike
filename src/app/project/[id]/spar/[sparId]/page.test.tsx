import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { appConversations } from '../../../../../conversations/app-conversations';
import { appSpars } from '../../../../../spars/app-spars';
import { renderPage, renderPageError } from '../../../../../test/render';
import { createTestSpars } from '../../../../../test/spars';
import { appTickets } from '../../../../../tickets/app-tickets';
import SparPage, { generateMetadata } from './page';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound, useRouter: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock('../../../../../spars/app-spars', () => ({ appSpars: vi.fn() }));
vi.mock('../../../../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock('../../../../conversations/actions', () => ({}));
vi.mock('../../../../spars/actions', () => ({ editSparCanvas: vi.fn() }));
vi.mock('../../../../projects/actions', () => ({
  loadProjectSkills: vi.fn().mockResolvedValue({ ok: true, skills: [] }),
}));

async function world() {
  const test = createTestSpars();
  vi.mocked(appTickets).mockReturnValue(test.tickets);
  vi.mocked(appSpars).mockReturnValue(test.spars);
  vi.mocked(appConversations).mockReturnValue(test.conversations);
  return test;
}

describe('SparPage', () => {
  it('shows the chat with the transcript beside the Canvas and Write-up regions', async () => {
    const test = await world();
    const ticket = test.tickets.createTicket({
      projectId: test.project.id,
      title: 'Faster triage',
    });
    const spar = await test.spars.startSpar({
      projectId: test.project.id,
      focusTicketNumber: ticket.number,
    });
    test.runner.runs[0].emit({ type: 'agent', text: 'What kind of Spar?' });

    const params = Promise.resolve({
      id: String(test.project.id),
      sparId: String(spar.id),
    });
    await renderPage(<main>{await SparPage({ params })}</main>);

    const chat = screen.getByRole('region', { name: 'Chat' });
    expect(within(chat).getByText('What kind of Spar?')).toBeInTheDocument();
    const canvas = screen.getByRole('region', { name: 'Canvas' });
    expect(
      within(canvas).getByRole('region', { name: /^Ideas/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Write-up' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Show' })).toBeInTheDocument();
    await expect(generateMetadata({ params })).resolves.toEqual({
      title: `Spar: T${ticket.number} Faster triage · Website`,
    });
  });

  it('returns not-found for a Spar of another Project or none', async () => {
    const test = await world();
    const other = test.tickets.createProject({ name: 'Other' });
    const spar = await test.spars.startSpar({ projectId: test.project.id });

    for (const params of [
      { id: String(other.id), sparId: String(spar.id) },
      { id: String(test.project.id), sparId: '999' },
    ]) {
      await expect(
        renderPageError(
          <main>{await SparPage({ params: Promise.resolve(params) })}</main>,
        ),
      ).resolves.toMatchObject({ message: 'NEXT_NOT_FOUND' });
    }
  });
});
