import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProject } from '../../app/projects/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import type { Project } from '../../tickets/tickets';
import { ProjectDirectory } from './project-directory';

vi.mock('../../app/projects/actions', () => ({ createProject: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

const renderDirectory = (pending: Promise<typeof projects>) =>
  act(async () => {
    renderWithTheme(<ProjectDirectory projects={pending} />);
  });

const projects: Project[] = [
  {
    id: 1,
    name: 'Website',
    color: null,
    icon: null,
    createdAt: new Date('2026-01-01'),
  },
  {
    id: 2,
    name: 'App',
    color: null,
    icon: null,
    createdAt: new Date('2026-01-02'),
  },
];

describe('ProjectDirectory', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    vi.mocked(createProject).mockReset();
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
  });

  it("shows each Project's icon in its colour", async () => {
    await renderDirectory(
      Promise.resolve([{ ...projects[0], color: 'pink', icon: 'star' }]),
    );

    const link = within(
      await screen.findByRole('list', { name: 'Projects' }),
    ).getByRole('link', { name: 'Website' });
    expect(link.querySelector('[data-color="pink"]')).not.toBeNull();
    expect(
      link.querySelector<HTMLElement>('[role="presentation"]')?.style.maskImage,
    ).toBe('url("/heroicons/outline/star.svg")');
  });

  it('lists Projects in oldest-first order, linking each to its Board', async () => {
    await renderDirectory(Promise.resolve(projects));

    const list = await screen.findByRole('list', { name: 'Projects' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Website', 'App']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/project/1',
      '/project/2',
    ]);
  });

  it('creates a Project from the New Project flow', async () => {
    vi.mocked(createProject).mockResolvedValue({ ok: true, projectId: 3 });
    await renderDirectory(Promise.resolve(projects));

    await userEvent.click(
      await screen.findByRole('button', { name: 'New Project' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'New Project' });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Project name' }),
      'Marketing',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create Project' }),
    );

    expect(createProject).toHaveBeenCalledExactlyOnceWith({
      name: 'Marketing',
    });
    expect(router.push).toHaveBeenCalledExactlyOnceWith('/project/3');
  });

  it('explains when there are no Projects yet', async () => {
    await renderDirectory(Promise.resolve([]));

    expect(await screen.findByText('No Projects yet.')).toBeInTheDocument();
  });

  it('shows the heading while the Projects are still loading', async () => {
    let resolve: (value: typeof projects) => void = () => {};
    const pending = new Promise<typeof projects>((r) => {
      resolve = r;
    });
    await renderDirectory(pending);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Projects' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Projects' })).toBeNull();
    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' }),
    ).not.toBeInTheDocument();

    await act(async () => resolve(projects));
    expect(
      await screen.findByRole('list', { name: 'Projects' }),
    ).toBeInTheDocument();
  });
});
