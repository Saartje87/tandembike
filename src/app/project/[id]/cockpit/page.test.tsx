import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../../../../test/tickets';
import { appTickets } from '../../../../tickets/app-tickets';
import CockpitPage from './page';

const { notFound, redirect } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((): never => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/navigation', () => ({ notFound, redirect }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));

const pageProps = (id: number) => ({
  params: Promise.resolve({ id: String(id) }),
});

describe('CockpitPage', () => {
  beforeEach(() => {
    redirect.mockClear();
    notFound.mockClear();
  });

  it("redirects to the Active Cycle's Board", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const prepared = tickets.createCycle({
      projectId: project.id,
      title: 'Next',
    });
    const active = tickets.createCycle({ projectId: project.id, title: 'Now' });
    tickets.startCycle(active.id);
    vi.mocked(appTickets).mockReturnValue(tickets);

    await expect(CockpitPage(pageProps(project.id))).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(redirect).toHaveBeenCalledWith(
      `/project/${project.id}/cycle/${active.id}`,
    );
    expect(prepared.id).not.toBe(active.id);
  });

  it('redirects to the Backlog when there is no Active Cycle', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createCycle({ projectId: project.id, title: 'Next' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await expect(CockpitPage(pageProps(project.id))).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(redirect).toHaveBeenCalledWith(`/project/${project.id}`);
  });

  it('shows not-found for a missing Project', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    await expect(CockpitPage(pageProps(999))).rejects.toThrow('NEXT_NOT_FOUND');

    expect(redirect).not.toHaveBeenCalled();
  });
});
