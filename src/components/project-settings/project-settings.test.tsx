// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { type FC, useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import {
  ProjectSettings,
  type SettingsSectionId,
  useSettingsShell,
} from './project-settings';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

/** A section with one text field whose draft marks it dirty. */
const DraftSection: FC<{ section: SettingsSectionId; field: string }> = ({
  section,
  field,
}) => {
  const [draft, setDraft] = useState('');
  const { setDirty } = useSettingsShell();
  useEffect(() => setDirty(section, draft !== ''), [section, draft, setDirty]);
  return (
    <label id={field}>
      {field}
      <input value={draft} onChange={(event) => setDraft(event.target.value)} />
    </label>
  );
};

const GoToRepository: FC = () => {
  const { select } = useSettingsShell();
  return (
    <button type="button" onClick={() => select('repository')}>
      Go to Repository
    </button>
  );
};

const panels = {
  general: (
    <>
      <DraftSection section="general" field="Name" />
      <GoToRepository />
    </>
  ),
  repository: <DraftSection section="repository" field="check-command" />,
  agent: <p>Agent panel</p>,
  automation: <p>Automation panel</p>,
  commands: <p>Commands panel</p>,
  references: <p>References panel</p>,
};

const at = (url: string) => window.history.replaceState(null, '', url);

const renderSettings = (hasRepository = true) =>
  renderWithTheme(
    <ProjectSettings hasRepository={hasRepository} panels={panels} />,
  );

const selectedTab = () =>
  screen.getByRole('tab', { selected: true }).textContent;

describe('ProjectSettings', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    at('/project/3/settings');
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    at('/');
  });

  it('shows the six sections as tabs, in order', () => {
    renderSettings();

    expect(
      within(screen.getByRole('tablist', { name: 'Settings sections' }))
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual([
      'General',
      'Repository',
      'Agent',
      'Automation',
      'Commands',
      'References',
    ]);
  });

  it('opens on General with a repository path saved', () => {
    renderSettings(true);

    expect(selectedTab()).toBe('General');
  });

  it('opens on Repository while no repository path is saved', () => {
    renderSettings(false);

    expect(selectedTab()).toBe('Repository');
  });

  it('opens the tab ?section= names, and keeps the one picked there', async () => {
    at('/project/3/settings?section=agent');
    renderSettings();

    expect(selectedTab()).toBe('Agent');
    expect(screen.getByText('Agent panel')).toBeVisible();

    await userEvent.click(screen.getByRole('tab', { name: 'Commands' }));

    expect(selectedTab()).toBe('Commands');
    expect(window.location.search).toBe('?section=commands');
  });

  it('follows a navigation that changes ?section= while open', () => {
    const { rerender } = renderSettings();

    at('/project/3/settings?section=automation');
    rerender(<ProjectSettings hasRepository panels={panels} />);

    expect(selectedTab()).toBe('Automation');
  });

  it('lets a section open another tab', async () => {
    renderSettings();

    await userEvent.click(
      screen.getByRole('button', { name: 'Go to Repository' }),
    );

    expect(selectedTab()).toBe('Repository');
  });

  it('opens the tab holding a field anchor and scrolls to the field', () => {
    at('/project/3/settings#check-command');
    renderSettings();

    expect(selectedTab()).toBe('Repository');
    expect(window.location.search).toBe('?section=repository');
    expect(window.location.hash).toBe('#check-command');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('opens the tab of an anchor the hash changes to', () => {
    renderSettings();

    act(() => {
      at('/project/3/settings#check-command');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(selectedTab()).toBe('Repository');
  });

  it('marks a tab with unsaved edits, and keeps them across a tab switch', async () => {
    renderSettings();
    const general = () => screen.getByRole('tab', { name: /General/ });

    expect(
      within(screen.getByRole('tablist')).queryByRole('img', {
        name: 'Unsaved changes',
      }),
    ).toBeNull();

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Web');
    await userEvent.click(screen.getByRole('tab', { name: 'Agent' }));

    expect(
      within(screen.getByRole('tablist')).getByRole('img', {
        name: 'Unsaved changes',
      }),
    ).toBeInTheDocument();

    await userEvent.click(general());

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Web');
  });
});
