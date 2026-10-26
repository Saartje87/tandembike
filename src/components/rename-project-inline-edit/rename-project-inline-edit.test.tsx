import { act, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  type RenameProjectResult,
  renameProject,
} from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import type { Project } from '../../tickets/tickets';
import { RenameProjectInlineEdit } from './rename-project-inline-edit';

vi.mock('../../app/projects/actions', () => ({
  renameProject: vi.fn(),
  styleProject: vi.fn(),
}));

const project: Project = {
  id: 3,
  name: 'Website',
  color: null,
  icon: null,
  archived: false,
  createdAt: new Date('2026-01-01'),
};

const name = () => screen.getByRole('button', { name: 'Website' });
const input = () => screen.getByRole('textbox', { name: 'Project name' });

/** A rename the server has not answered yet, answered with `settle`. */
const pendingRename = () => {
  const { promise, resolve } = Promise.withResolvers<RenameProjectResult>();
  vi.mocked(renameProject).mockReturnValue(promise);
  let settled = false;
  const settle = async (result: RenameProjectResult) => {
    if (settled) {
      return;
    }
    settled = true;
    await act(async () => resolve(result));
  };
  onTestFinished(() => settle({ ok: true, name: 'Website' }));
  return settle;
};

const rename = async (to: string) => {
  await userEvent.click(name());
  await userEvent.clear(input());
  await userEvent.type(input(), to);
  await userEvent.keyboard('{Enter}');
};

describe('RenameProjectInlineEdit', () => {
  beforeEach(() => {
    vi.mocked(renameProject).mockReset();
  });

  it('shows the name as the heading, with no Rename button', () => {
    renderWithTheme(<RenameProjectInlineEdit project={project} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Website' }),
    ).toContainElement(name());
    expect(name()).toHaveAccessibleDescription('Edit project name');
    expect(
      screen.queryByRole('button', { name: 'Rename' }),
    ).not.toBeInTheDocument();
  });

  it('opens the editor on the current name when the name is clicked', async () => {
    renderWithTheme(<RenameProjectInlineEdit project={project} />);

    await userEvent.click(name());

    expect(input()).toHaveValue('Website');
    expect(input()).toHaveFocus();
  });

  it('opens the editor with Enter on the focused name', async () => {
    renderWithTheme(<RenameProjectInlineEdit project={project} />);

    await userEvent.tab();
    expect(name()).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(input()).toHaveValue('Website');
  });

  it('closes at once showing the new name while the rename saves', async () => {
    const settle = pendingRename();
    renderWithTheme(<RenameProjectInlineEdit project={project} />);

    await rename('Homepage');

    expect(renameProject).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      name: 'Homepage',
    });
    expect(
      screen.queryByRole('textbox', { name: 'Project name' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Homepage' }),
    ).toBeInTheDocument();
    await settle({ ok: true, name: 'Homepage' });
  });

  it('reopens with the text and the reason when the name is refused', async () => {
    const reason = 'A Project named "App" already exists. Choose another name.';
    const settle = pendingRename();
    renderWithTheme(<RenameProjectInlineEdit project={project} />);

    await rename('app');
    await settle({ ok: false, error: reason });

    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(input()).toHaveValue('app');
    expect(input()).toHaveAccessibleDescription(reason);
  });

  it('cancels on Escape without renaming the Project', async () => {
    renderWithTheme(<RenameProjectInlineEdit project={project} />);

    await userEvent.click(name());
    await userEvent.type(input(), ' site');
    await userEvent.keyboard('{Escape}');

    expect(renameProject).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Website' }),
    ).toBeInTheDocument();
  });

  it("shows an archived Project's name as plain text that cannot be opened", () => {
    renderWithTheme(
      <RenameProjectInlineEdit project={{ ...project, archived: true }} />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Website' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
