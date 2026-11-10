// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { appConversations } from '../../../../../conversations/app-conversations';
import { appSpars } from '../../../../../spars/app-spars';
import { renderPage, renderPageError } from '../../../../../test/render';
import { createTestSettings } from '../../../../../test/settings';
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
vi.mock('../../../../../settings/app-settings', () => ({
  appSettings: () => createTestSettings(),
}));
vi.mock('../../../../../spars/app-spars', () => ({ appSpars: vi.fn() }));
vi.mock('../../../../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock('../../../../conversations/actions', () => ({}));
vi.mock('../../../../spars/actions', () => ({
  editSparCanvas: vi.fn(),
  sendSparTurn: vi.fn(),
  updateSparWriteUp: vi.fn(),
  closeSpar: vi.fn(),
  reopenSpar: vi.fn(),
  handOffSpar: vi.fn(),
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

  it('shows a closed Spar read-only, with Reopen', async () => {
    const test = await world();
    const spar = await test.spars.startSpar({ projectId: test.project.id });
    test.spars.updateWriteUp(spar.id, { decisions: 'Keep it small' }, 'user');
    await test.spars.closeSpar(spar.id);
    test.runner.runs[0].emit({ type: 'turn', costUsd: 0 });

    const params = Promise.resolve({
      id: String(test.project.id),
      sparId: String(spar.id),
    });
    await renderPage(<main>{await SparPage({ params })}</main>);

    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
    expect(
      screen.getByText('This Spar is closed. Reopen it to reply.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Reply' })).toBeNull();
    expect(screen.getByText('Keep it small')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Canvas' })).queryByRole(
        'textbox',
      ),
    ).toBeNull();
  });

  it("shows Claude's Hand-off draft, and once handed off, the outcome Ticket", async () => {
    const test = await world();
    const spar = await test.spars.startSpar({ projectId: test.project.id });
    test.spars.proposeHandOff(spar.id, {
      title: 'Cache it',
      description: 'Why',
      path: 'ticket',
    });
    const params = Promise.resolve({
      id: String(test.project.id),
      sparId: String(spar.id),
    });
    await renderPage(<main>{await SparPage({ params })}</main>);
    expect(screen.getByRole('form', { name: 'Hand-off' })).toBeInTheDocument();
    cleanup();

    const { ticketNumber } = await test.spars.handOff(spar.id, {
      title: 'Cache it',
      description: 'Why',
      path: 'ticket',
    });
    await renderPage(<main>{await SparPage({ params })}</main>);

    expect(screen.queryByRole('form', { name: 'Hand-off' })).toBeNull();
    expect(
      screen.getByRole('link', { name: `T${ticketNumber} Cache it` }),
    ).toHaveAttribute('href', `/ticket/${ticketNumber}`);
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
