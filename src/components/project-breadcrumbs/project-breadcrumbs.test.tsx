import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { createTestTickets } from '../../test/tickets';
import { appTickets } from '../../tickets/app-tickets';
import { ProjectBreadcrumbs } from './project-breadcrumbs';

vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../tickets/app-tickets', () => ({
  appTickets: vi.fn(),
}));

describe('ProjectBreadcrumbs', () => {
  it("shows the trail to a Project's Board", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    renderWithTheme(
      <header>
        {
          await ProjectBreadcrumbs({
            params: Promise.resolve({ id: String(project.id) }),
          })
        }
      </header>,
    );

    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(
      within(trail).getByRole('link', { name: 'Projects' }),
    ).toHaveAttribute('href', '/projects');
    expect(within(trail).getByText('Website')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it("shows the Project's icon in its colour beside its name", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.styleProject(project.id, { color: 'amber', icon: 'beaker' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    renderWithTheme(
      <header>
        {
          await ProjectBreadcrumbs({
            params: Promise.resolve({ id: String(project.id) }),
          })
        }
      </header>,
    );

    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(trail.querySelector('[data-color="amber"]')).not.toBeNull();
    expect(
      trail.querySelector<HTMLElement>('[role="presentation"]')?.style
        .maskImage,
    ).toBe('url("/heroicons/outline/beaker.svg")');
  });

  it.each(['999', 'abc'])(
    'shows no trail for a Project that does not exist (%s)',
    async (id) => {
      vi.mocked(appTickets).mockReturnValue(createTestTickets());

      const trail = await ProjectBreadcrumbs({
        params: Promise.resolve({ id }),
      });

      expect(trail).toBeNull();
    },
  );
});
