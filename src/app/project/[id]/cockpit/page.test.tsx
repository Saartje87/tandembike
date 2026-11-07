import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appConversations } from '../../../../conversations/app-conversations';
import type { Conversation } from '../../../../conversations/conversations';
import { renderPage } from '../../../../test/render';
import { createTestTickets } from '../../../../test/tickets';
import { appTickets } from '../../../../tickets/app-tickets';
import CockpitPage, { generateMetadata } from './page';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock('../../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock('../../../conversations/actions', () => ({
  currentConversationActivity: vi.fn(() => new Promise(() => {})),
}));

const conversation = (
  fields: Pick<Conversation, 'intent' | 'state'>,
): Conversation => fields as Conversation;

const stubConversations = (list: Conversation[]) =>
  vi.mocked(appConversations).mockReturnValue({
    list: () => list,
  } as unknown as ReturnType<typeof appConversations>);

const pageProps = (id: number) => ({
  params: Promise.resolve({ id: String(id) }),
  searchParams: Promise.resolve({}),
});

describe('CockpitPage', () => {
  beforeEach(() => {
    stubConversations([]);
  });

  it("shows the Active Cycle's Tickets and the Start runs working", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(project.id, {
      parallelRuns: true,
      maxConcurrentRuns: 3,
    });
    const cycle = tickets.createCycle({
      projectId: project.id,
      title: 'Factory Board',
    });
    const planned = tickets.createTicket({
      projectId: project.id,
      title: 'Show the status line',
      cycleId: cycle.id,
    });
    tickets.updateTicket(planned.number, { status: 'In progress' });
    tickets.createTicket({ projectId: project.id, title: 'In the Backlog' });
    tickets.startCycle(cycle.id);
    vi.mocked(appTickets).mockReturnValue(tickets);
    stubConversations([
      conversation({ intent: 'start', state: 'running' }),
      conversation({ intent: 'start', state: 'waiting' }),
      conversation({ intent: 'start', state: 'idle' }),
      conversation({ intent: 'triage', state: 'running' }),
    ]);

    await renderPage(<main>{await CockpitPage(pageProps(project.id))}</main>);

    expect(screen.getByText('Factory Board · 0/1 done')).toBeVisible();
    expect(screen.getByText('Runs 2/3')).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Needs you' })).getByRole(
        'link',
        { name: 'Show the status line' },
      ),
    ).toBeVisible();
    expect(screen.queryByText('In the Backlog')).not.toBeInTheDocument();
    await expect(generateMetadata(pageProps(project.id))).resolves.toEqual({
      title: 'Cockpit · Website',
    });
  });

  it('allows one Start run at a time without parallel runs', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Now' });
    tickets.startCycle(cycle.id);
    vi.mocked(appTickets).mockReturnValue(tickets);

    await renderPage(<main>{await CockpitPage(pageProps(project.id))}</main>);

    expect(screen.getByText('Runs 0/1')).toBeVisible();
  });

  it('points to the Prepared Cycles to start one when none is Active', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const next = tickets.createCycle({ projectId: project.id, title: 'Next' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await renderPage(<main>{await CockpitPage(pageProps(project.id))}</main>);

    expect(
      screen.getByRole('heading', { name: 'No Active Cycle' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      `/project/${project.id}/cycle/${next.id}`,
    );
  });

  it('says to add a Cycle when the Project has none to start', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await renderPage(<main>{await CockpitPage(pageProps(project.id))}</main>);

    expect(
      screen.getByText(/Add one with New Cycle, then start it/),
    ).toBeVisible();
  });
});
