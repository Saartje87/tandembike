import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  renderPage,
  renderPageError,
  renderWithTheme,
} from '../../../../test/render';
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

describe('CyclesPage', () => {
  beforeEach(() => {
    notFound.mockClear();
  });

  it("lists the Project's archived Cycles", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.createCycle({ projectId: project.id, title: 'Prepared' });
    tickets.startCycle(beta.id);
    tickets.archiveCycle(beta.id);
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({ id: String(project.id) });
    await renderPage(<main>{await CyclesPage({ params })}</main>);

    // The Project's layout shows its header and tabs.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Archived Cycles' }),
    ).toHaveTextContent('Beta');
    expect(screen.queryByText('Prepared')).not.toBeInTheDocument();
    await expect(generateMetadata({ params })).resolves.toEqual({
      title: 'History · Website',
    });
  });

  it('shows the loading state until the Project loads', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    renderWithTheme(
      <main>{await CyclesPage({ params: new Promise(() => {}) })}</main>,
    );

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('returns not-found for a missing Project', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    await expect(
      renderPageError(
        <main>
          {await CyclesPage({ params: Promise.resolve({ id: '999' }) })}
        </main>,
      ),
    ).resolves.toMatchObject({ message: 'NEXT_NOT_FOUND' });
    expect(notFound).toHaveBeenCalledOnce();
  });
});
