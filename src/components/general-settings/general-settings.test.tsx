// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { archiveProject, renameProject } from '../../app/projects/actions';
import { renderWithTheme } from '../../test/render';
import { GeneralSettings } from './general-settings';

vi.mock('../../app/projects/actions', () => ({
  archiveProject: vi.fn(),
  renameProject: vi.fn(),
  styleProject: vi.fn(),
}));

const project = {
  id: 3,
  name: 'Website',
  color: null,
  icon: null,
  archived: false,
  createdAt: new Date('2026-01-01'),
};

const card = () => screen.getByRole('region', { name: 'General' });
const nameField = () => screen.getByRole('textbox', { name: 'Name' });

describe('GeneralSettings', () => {
  beforeEach(() => {
    vi.mocked(renameProject).mockReset();
    vi.mocked(renameProject).mockResolvedValue({ ok: true, name: 'Shop' });
    vi.mocked(archiveProject).mockReset();
    vi.mocked(archiveProject).mockResolvedValue({ ok: true });
  });

  it('shows the name, the colour and icon, and Archive last, below the card', () => {
    renderWithTheme(<GeneralSettings project={project} />);

    expect(nameField()).toHaveValue('Website');
    expect(
      within(card()).getByRole('button', { name: 'Colour and icon' }),
    ).toBeInTheDocument();
    const archive = screen.getByRole('button', { name: 'Archive Website' });
    expect(card()).not.toContainElement(archive);
    expect(
      card().compareDocumentPosition(archive) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('saves the name with the section Save, shown only while it is edited', async () => {
    renderWithTheme(<GeneralSettings project={project} />);

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Shop');
    await userEvent.click(within(card()).getByRole('button', { name: 'Save' }));

    expect(renameProject).toHaveBeenCalledWith({ projectId: 3, name: 'Shop' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull(),
    );
  });

  it('shows a refusal under the name and keeps the draft', async () => {
    vi.mocked(renameProject).mockResolvedValue({
      ok: false,
      error: 'A Project named Shop already exists.',
    });
    renderWithTheme(<GeneralSettings project={project} />);

    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Shop');
    await userEvent.click(within(card()).getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('A Project named Shop already exists.'),
    ).toBeInTheDocument();
    expect(nameField()).toHaveValue('Shop');
    expect(nameField()).toHaveAccessibleDescription(
      'A Project named Shop already exists.',
    );
  });

  it('puts the name back with Discard', async () => {
    renderWithTheme(<GeneralSettings project={project} />);

    await userEvent.type(nameField(), ' site');
    await userEvent.click(
      within(card()).getByRole('button', { name: 'Discard' }),
    );

    expect(nameField()).toHaveValue('Website');
    expect(renameProject).not.toHaveBeenCalled();
  });

  it('archives the Project from its danger zone', async () => {
    renderWithTheme(<GeneralSettings project={project} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Archive Website' }),
    );

    expect(archiveProject).toHaveBeenCalledWith({ projectId: 3 });
  });
});
