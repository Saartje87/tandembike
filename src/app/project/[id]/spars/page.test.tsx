import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { appSpars } from '../../../../spars/app-spars';
import { renderPage } from '../../../../test/render';
import { createTestSpars } from '../../../../test/spars';
import { appTickets } from '../../../../tickets/app-tickets';
import SparsPage, { generateMetadata } from './page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  useRouter: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock('../../../../spars/app-spars', () => ({ appSpars: vi.fn() }));
vi.mock('../../../spars/actions', () => ({ startSpar: vi.fn() }));

describe('SparsPage', () => {
  it("shows the Spar button and the Project's Spars, each linking to its page", async () => {
    const world = createTestSpars();
    vi.mocked(appTickets).mockReturnValue(world.tickets);
    vi.mocked(appSpars).mockReturnValue(world.spars);
    const spar = await world.spars.startSpar({
      projectId: world.project.id,
      topic: 'Faster triage',
    });

    const params = Promise.resolve({ id: String(world.project.id) });
    await renderPage(<main>{await SparsPage({ params })}</main>);

    expect(screen.getByRole('button', { name: 'Spar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Faster triage' })).toHaveAttribute(
      'href',
      `/project/${world.project.id}/spar/${spar.id}`,
    );
    await expect(generateMetadata({ params })).resolves.toEqual({
      title: 'Spars · Website',
    });
  });
});
