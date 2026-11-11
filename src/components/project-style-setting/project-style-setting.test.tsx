// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { styleProject } from '../../app/projects/actions';
import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import { ProjectStyleSetting } from './project-style-setting';

vi.mock('../../app/projects/actions', () => ({ styleProject: vi.fn() }));

showOpenPopovers();

const project = { id: 3, color: null, icon: null };

const openPicker = () =>
  userEvent.click(screen.getByRole('button', { name: 'Colour and icon' }));
const picker = () => within(screen.getByRole('group', { name: 'Colour' }));
const icons = () => within(screen.getByRole('group', { name: 'Icon' }));
const pressed = (group: ReturnType<typeof picker>) =>
  group
    .getAllByRole('button', { pressed: true })
    .map((button) => button.getAttribute('aria-label'));

describe('ProjectStyleSetting', () => {
  beforeEach(() => {
    vi.mocked(styleProject).mockReset();
  });

  it('offers every colour and icon, each with a Default that is picked when none is set', async () => {
    renderWithTheme(<ProjectStyleSetting project={project} />);

    await openPicker();

    expect(
      picker()
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Default',
      'Red',
      'Orange',
      'Amber',
      'Green',
      'Teal',
      'Blue',
      'Indigo',
      'Purple',
      'Pink',
      'Grey',
    ]);
    expect(pressed(picker())).toEqual(['Default']);
    expect(icons().getAllByRole('button')).toHaveLength(41);
    expect(pressed(icons())).toEqual(['Default']);
  });

  it('saves a picked colour at once, showing it while the popover stays open', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(styleProject).mockReturnValue(promise);
    renderWithTheme(<ProjectStyleSetting project={project} />);

    await openPicker();
    await userEvent.click(picker().getByRole('button', { name: 'Teal' }));

    expect(styleProject).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      color: 'teal',
    });
    expect(pressed(picker())).toEqual(['Teal']);
    await act(async () => resolve({ ok: true }));
    expect(screen.getByRole('group', { name: 'Colour' })).toBeInTheDocument();
  });

  it('saves a picked icon, and Default clears a colour', async () => {
    vi.mocked(styleProject).mockResolvedValue({ ok: true });
    renderWithTheme(
      <ProjectStyleSetting
        project={{ ...project, color: 'teal', icon: 'star' }}
      />,
    );

    await openPicker();
    expect(pressed(icons())).toEqual(['Star']);
    await userEvent.click(
      icons().getByRole('button', { name: 'Rocket launch' }),
    );
    await userEvent.click(picker().getByRole('button', { name: 'Default' }));

    expect(styleProject).toHaveBeenNthCalledWith(1, {
      projectId: 3,
      icon: 'rocket-launch',
    });
    expect(styleProject).toHaveBeenNthCalledWith(2, {
      projectId: 3,
      color: null,
    });
  });

  it('puts the pick back and explains in the popover when it is refused', async () => {
    vi.mocked(styleProject).mockResolvedValue({
      ok: false,
      error: 'There is no Project with id 3.',
    });
    renderWithTheme(<ProjectStyleSetting project={project} />);

    await openPicker();
    await userEvent.click(picker().getByRole('button', { name: 'Teal' }));

    expect(
      await within(
        screen.getByRole('dialog', { name: 'Colour and icon' }),
      ).findByRole('alert'),
    ).toHaveTextContent('There is no Project with id 3.');
    // The alert can show one render before the optimistic pick is undone.
    await waitFor(() => expect(pressed(picker())).toEqual(['Default']));
  });
  it('puts the pick back and explains in the popover when the save throws (T1322)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(styleProject).mockRejectedValue(new Error('network down'));
    renderWithTheme(<ProjectStyleSetting project={project} />);

    await openPicker();
    await userEvent.click(picker().getByRole('button', { name: 'Teal' }));

    expect(
      await within(
        screen.getByRole('dialog', { name: 'Colour and icon' }),
      ).findByRole('alert'),
    ).toHaveTextContent('The colour and icon could not be saved. Try again.');
    await waitFor(() => expect(pressed(picker())).toEqual(['Default']));
  });
});
