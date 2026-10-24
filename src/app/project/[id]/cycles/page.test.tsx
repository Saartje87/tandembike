import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../../../test/render';
import { createTestTickets } from '../../../../test/tickets';
import { appTickets } from '../../../../tickets/app-tickets';
import CyclesPage, { generateMetadata } from './page';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock('../../../../components/project-tabs/project-tabs', () => ({
  ProjectTabs: ({ current }: { current: string }) => (
    <nav>{`Tabs current ${current}`}</nav>
  ),
}));

describe('CyclesPage', () => {
  beforeEach(() => {
    notFound.mockClear();
  });

  it("lists the Project's archived Cycles under the History tab", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.createCycle({ projectId: project.id, title: 'Prepared' });
    tickets.startCycle(beta.id);
    tickets.archiveCycle(beta.id);
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({ id: String(project.id) });
    renderWithTheme(<main>{await CyclesPage({ params })}</main>);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Website' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toHaveTextContent(
      'Tabs current history',
    );
    expect(
      screen.getByRole('list', { name: 'Archived Cycles' }),
    ).toHaveTextContent('Beta');
    expect(screen.queryByText('Prepared')).not.toBeInTheDocument();
    await expect(generateMetadata({ params })).resolves.toEqual({
      title: 'History · Website',
    });
  });

  it('returns not-found for a missing Project', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    await expect(
      CyclesPage({ params: Promise.resolve({ id: '999' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
  });
});
