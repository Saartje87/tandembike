import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { restoreProject } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { ArchivedProjectDirectory } from './archived-project-directory';

vi.mock('../../app/projects/actions', () => ({ restoreProject: vi.fn() }));

const projects = [
  {
    id: 1,
    name: 'Website',
    color: null,
    icon: null,
    archived: false,
    createdAt: new Date('2026-01-01'),
  },
  {
    id: 2,
    name: 'Old site',
    color: null,
    icon: null,
    archived: true,
    createdAt: new Date('2026-01-02'),
  },
  {
    id: 3,
    name: 'Old app',
    color: null,
    icon: null,
    archived: true,
    createdAt: new Date('2026-01-03'),
  },
];

const renderDirectory = (shown: typeof projects) =>
  act(async () => {
    renderWithTheme(
      <ArchivedProjectDirectory projects={Promise.resolve(shown)} />,
    );
  });

describe('ArchivedProjectDirectory', () => {
  beforeEach(() => {
    vi.mocked(restoreProject).mockReset();
  });

  it('lists only the archived Projects, oldest first, linking each to its Board', async () => {
    await renderDirectory(projects);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Archived Projects' }),
    ).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Archived Projects' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Old site',
      'Old app',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/project/2',
      '/project/3',
    ]);
  });

  it('restores a Project from the list', async () => {
    vi.mocked(restoreProject).mockResolvedValue({ ok: true });
    await renderDirectory(projects);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Restore Old app' }),
    );

    expect(restoreProject).toHaveBeenCalledExactlyOnceWith({ projectId: 3 });
  });

  it('explains when no Project is archived', async () => {
    await renderDirectory(projects.slice(0, 1));

    expect(
      await screen.findByText('No archived Projects.'),
    ).toBeInTheDocument();
  });
});
