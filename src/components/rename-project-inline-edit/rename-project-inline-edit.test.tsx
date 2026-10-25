import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renameProject } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { RenameProjectInlineEdit } from './rename-project-inline-edit';

vi.mock('../../app/projects/actions', () => ({
  renameProject: vi.fn(),
  styleProject: vi.fn(),
}));

const project = {
  id: 3,
  name: 'Website',
  color: null,
  icon: null,
  createdAt: new Date('2026-01-01'),
};

const openInlineEditor = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
  return screen.getByRole('textbox', { name: 'Project name' });
};

describe('RenameProjectInlineEdit', () => {
  beforeEach(() => {
    vi.mocked(renameProject).mockReset();
  });

  it('edits the Project name inline from its current value', async () => {
    renderWithTheme(<RenameProjectInlineEdit project={project} />);

    const input = await openInlineEditor();

    expect(input).toHaveValue('Website');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('saves the Project name on Enter', async () => {
    vi.mocked(renameProject).mockResolvedValue({ ok: true, name: 'Homepage' });
    renderWithTheme(<RenameProjectInlineEdit project={project} />);

    const input = await openInlineEditor();
    await userEvent.clear(input);
    await userEvent.type(input, 'Homepage');
    await userEvent.keyboard('{Enter}');

    expect(renameProject).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      name: 'Homepage',
    });
    await screen.findByRole('button', { name: 'Rename' });
    expect(
      screen.queryByRole('textbox', { name: 'Project name' }),
    ).not.toBeInTheDocument();
  });

  it('cancels editing on Escape without renaming the Project', async () => {
    renderWithTheme(<RenameProjectInlineEdit project={project} />);

    const input = await openInlineEditor();
    await userEvent.keyboard('{Escape}');

    expect(renameProject).not.toHaveBeenCalled();
    expect(input).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Website' }),
    ).toBeInTheDocument();
  });

  it('cancels editing from the Cancel button without renaming the Project', async () => {
    renderWithTheme(<RenameProjectInlineEdit project={project} />);

    await openInlineEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(renameProject).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('textbox', { name: 'Project name' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Website' }),
    ).toBeInTheDocument();
  });

  it('keeps the editor open and explains why the Project could not be renamed', async () => {
    vi.mocked(renameProject).mockResolvedValue({
      ok: false,
      error: 'A Project named "App" already exists. Choose another name.',
    });
    renderWithTheme(<RenameProjectInlineEdit project={project} />);

    const input = await openInlineEditor();
    await userEvent.clear(input);
    await userEvent.type(input, 'app');
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A Project named "App" already exists. Choose another name.',
    );
    expect(input).toHaveAccessibleDescription(
      'A Project named "App" already exists. Choose another name.',
    );
    expect(input).toHaveValue('app');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
