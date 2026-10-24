import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProject } from '../../app/projects/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { FirstRun } from './first-run';

vi.mock('../../app/projects/actions', () => ({ createProject: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

describe('FirstRun', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    vi.mocked(createProject).mockReset();
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
  });

  it('asks the User to create their first Project', () => {
    renderWithTheme(<FirstRun />);

    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Create your first Project',
      }),
    ).toBeInTheDocument();
  });

  it('creates the first Project and opens its Board', async () => {
    vi.mocked(createProject).mockResolvedValue({ ok: true, projectId: 1 });
    renderWithTheme(<FirstRun />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Project name' }),
      'Website',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create Project' }),
    );

    expect(createProject).toHaveBeenCalledExactlyOnceWith({ name: 'Website' });
    expect(router.push).toHaveBeenCalledExactlyOnceWith('/project/1');
  });
});
