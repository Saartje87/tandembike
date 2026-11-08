import { fireEvent, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createProject,
  detectProjectRepository,
} from '../../app/projects/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { NewProjectForm } from './new-project-form';

vi.mock('../../app/projects/actions', () => ({
  createProject: vi.fn(),
  detectProjectRepository: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

describe('NewProjectForm', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    vi.mocked(createProject).mockReset();
    vi.mocked(detectProjectRepository).mockReset();
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
  });

  it('creates the Project and opens its Board', async () => {
    vi.mocked(createProject).mockResolvedValue({ ok: true, projectId: 7 });
    const onCreated = vi.fn();
    renderWithTheme(<NewProjectForm onCreated={onCreated} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Project name' }),
      'Website',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create Project' }),
    );

    expect(createProject).toHaveBeenCalledExactlyOnceWith({ name: 'Website' });
    expect(router.push).toHaveBeenCalledExactlyOnceWith('/project/7');
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it('shows why the Project could not be created', async () => {
    vi.mocked(createProject).mockResolvedValue({
      ok: false,
      error: 'A Project named "Website" already exists. Choose another name.',
    });
    renderWithTheme(<NewProjectForm />);
    const input = screen.getByRole('textbox', { name: 'Project name' });

    await userEvent.type(input, 'website');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create Project' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A Project named "Website" already exists. Choose another name.',
    );
    expect(input).toHaveAccessibleDescription(
      'A Project named "Website" already exists. Choose another name.',
    );
    expect(input).toHaveValue('website');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('creates the Project once however often it is submitted while it saves', async () => {
    let finish: (result: { ok: true; projectId: number }) => void = () => {};
    vi.mocked(createProject).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderWithTheme(<NewProjectForm />);
    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Project name',
    });

    await userEvent.type(input, 'Website{Enter}');
    const { form } = input;
    if (!form) {
      throw new Error('The name field is not in a form.');
    }
    fireEvent.submit(form);
    finish({ ok: true, projectId: 7 });

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledExactlyOnceWith('/project/7'),
    );
    expect(createProject).toHaveBeenCalledOnce();
  });

  describe('with a repository folder', () => {
    const detected = {
      ok: true as const,
      repository: {
        ok: true as const,
        path: '/Users/me/website',
        defaultBranch: 'main',
        remote: 'git@github.com:acme/site.git',
        referenceTemplate: {
          prefix: '#',
          url: 'https://github.com/acme/site/issues/{n}',
        },
        checkCommands: ['npm run check', 'make test'],
      },
    };

    async function detect() {
      vi.mocked(detectProjectRepository).mockResolvedValue(detected);
      renderWithTheme(<NewProjectForm />);
      await userEvent.type(
        screen.getByRole('textbox', { name: /Repository folder/ }),
        '/Users/me/website',
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Detect repository' }),
      );
      await screen.findByText('main');
    }

    it('shows what it detected, with the name defaulting to the folder name', async () => {
      await detect();

      expect(detectProjectRepository).toHaveBeenCalledWith({
        path: '/Users/me/website',
      });
      expect(createProject).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue(
        'website',
      );
      expect(
        screen.getByRole('textbox', { name: 'Check command' }),
      ).toHaveValue('npm run check');
      expect(screen.getByText('git@github.com:acme/site.git')).toBeVisible();
      expect(
        screen.getByRole('checkbox', { name: /Reference template/ }),
      ).toBeChecked();
      expect(
        screen.getByRole('button', { name: 'Use make test' }),
      ).toBeInTheDocument();
    });

    it('creates the Project with the edited Check command and the unticked template left out', async () => {
      vi.mocked(createProject).mockResolvedValue({ ok: true, projectId: 9 });
      await detect();

      const check = screen.getByRole('textbox', { name: 'Check command' });
      await userEvent.clear(check);
      await userEvent.type(check, 'make check');
      await userEvent.click(
        screen.getByRole('checkbox', { name: /Reference template/ }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Create Project' }),
      );

      expect(createProject).toHaveBeenCalledExactlyOnceWith({
        name: 'website',
        repositoryPath: '/Users/me/website',
        checkCommand: 'make check',
      });
      expect(router.push).toHaveBeenCalledExactlyOnceWith('/project/9');
    });

    it('submits the accepted template and a picked candidate', async () => {
      vi.mocked(createProject).mockResolvedValue({ ok: true, projectId: 9 });
      await detect();

      await userEvent.click(
        screen.getByRole('button', { name: 'Use make test' }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Create Project' }),
      );

      expect(createProject).toHaveBeenCalledExactlyOnceWith({
        name: 'website',
        repositoryPath: '/Users/me/website',
        checkCommand: 'make test',
        referenceTemplate: {
          prefix: '#',
          url: 'https://github.com/acme/site/issues/{n}',
        },
      });
    });

    it('shows a folder that is not a repository on the folder field', async () => {
      vi.mocked(detectProjectRepository).mockResolvedValue({
        ok: false,
        error: 'This folder is not a git repository: it has no .git inside.',
      });
      renderWithTheme(<NewProjectForm />);
      const folder = screen.getByRole('textbox', { name: /Repository folder/ });

      await userEvent.type(folder, '/tmp/x');
      await userEvent.click(
        screen.getByRole('button', { name: 'Detect repository' }),
      );

      expect(folder).toHaveAccessibleDescription(
        'This folder is not a git repository: it has no .git inside.',
      );
    });

    it('shows a duplicate repository on the folder field, keeping the draft', async () => {
      vi.mocked(createProject).mockResolvedValue({
        ok: false,
        error: 'x',
        fieldErrors: {
          repositoryPath: 'The Project "Site" already uses this repository.',
        },
      });
      await detect();

      await userEvent.click(
        screen.getByRole('button', { name: 'Create Project' }),
      );

      expect(
        screen.getByRole('textbox', { name: /Repository folder/ }),
      ).toHaveAccessibleDescription(
        'The Project "Site" already uses this repository.',
      );
      expect(
        screen.getByRole('textbox', { name: 'Check command' }),
      ).toHaveValue('npm run check');
      expect(router.push).not.toHaveBeenCalled();
    });
  });
});
