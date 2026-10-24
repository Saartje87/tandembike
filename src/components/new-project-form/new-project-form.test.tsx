import { fireEvent, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProject } from '../../app/projects/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { NewProjectForm } from './new-project-form';

vi.mock('../../app/projects/actions', () => ({ createProject: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

describe('NewProjectForm', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    vi.mocked(createProject).mockReset();
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
});
