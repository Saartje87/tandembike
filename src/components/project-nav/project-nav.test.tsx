import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { usePathname, useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProject } from '../../app/projects/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { ProjectNav } from './project-nav';

vi.mock('../../app/projects/actions', () => ({ createProject: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

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
    name: 'App',
    color: null,
    icon: null,
    archived: false,
    createdAt: new Date('2026-01-02'),
  },
];

describe('ProjectNav', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    vi.mocked(createProject).mockReset();
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    vi.mocked(usePathname).mockReturnValue('/');
  });

  it('lists the Projects, each linking to its Board', () => {
    renderWithTheme(<ProjectNav projects={projects} />);

    const nav = screen.getByRole('navigation', { name: 'Projects' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Website', 'App']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/project/1',
      '/project/2',
    ]);
  });

  it("shows each Project's icon in its colour, or a folder", () => {
    renderWithTheme(
      <ProjectNav
        projects={[
          { ...projects[0], color: 'teal', icon: 'rocket-launch' },
          projects[1],
        ]}
      />,
    );

    const [website, app] = within(
      screen.getByRole('navigation', { name: 'Projects' }),
    ).getAllByRole('link');
    expect(website.querySelector('[data-color="teal"]')).not.toBeNull();
    expect(
      website.querySelector<HTMLElement>('[role="presentation"]')?.style
        .maskImage,
    ).toBe('url("/heroicons/outline/rocket-launch.svg")');
    expect(
      app.querySelector<HTMLElement>('[role="presentation"]')?.style.maskImage,
    ).toBe('url("/heroicons/outline/folder.svg")');
  });

  it.each([
    ['/project/2', 'App'],
    ['/project/2/cycle/7', 'App'],
    ['/projects', null],
    ['/', null],
  ])('marks the current Project at %s', (pathname, current) => {
    vi.mocked(usePathname).mockReturnValue(pathname);
    renderWithTheme(<ProjectNav projects={projects} />);

    const marked = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(marked.map((link) => link.textContent)).toEqual(
      current ? [current] : [],
    );
  });

  it('creates a Project from the New Project dialog', async () => {
    vi.mocked(createProject).mockResolvedValue({ ok: true, projectId: 3 });
    renderWithTheme(<ProjectNav projects={projects} />);

    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the dialog open with the error when the name is taken', async () => {
    vi.mocked(createProject).mockResolvedValue({
      ok: false,
      error: 'A Project named "Website" already exists. Choose another name.',
    });
    renderWithTheme(<ProjectNav projects={projects} />);

    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
    const dialog = screen.getByRole('dialog', { name: 'New Project' });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Project name' }),
      ' website ',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Create Project' }),
    );

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'A Project named "Website" already exists. Choose another name.',
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('closes the dialog on Cancel without creating anything', async () => {
    renderWithTheme(<ProjectNav projects={projects} />);

    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createProject).not.toHaveBeenCalled();
  });
});
