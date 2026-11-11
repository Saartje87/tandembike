// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { ProjectSettings } from '../project-settings/project-settings';
import { SettingsSection, type SettingsSectionProps } from './settings-section';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const at = (url: string) => window.history.replaceState(null, '', url);

const renderSection = (props: Partial<SettingsSectionProps> = {}) =>
  renderWithTheme(
    <ProjectSettings
      hasRepository
      panels={{
        general: (
          <form aria-label="General settings">
            <SettingsSection
              section="general"
              title="General"
              description="The Project's name and look."
              {...props}
            >
              <p>Fields</p>
            </SettingsSection>
          </form>
        ),
        repository: <p id="repository-path">Repository panel</p>,
        agent: null,
        automation: null,
        commands: null,
        references: null,
      }}
    />,
  );

const card = () => screen.getByRole('region', { name: 'General' });

describe('SettingsSection', () => {
  beforeEach(() => {
    at('/project/3/settings');
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    at('/');
  });

  it('shows its title, one-line description and content', () => {
    renderSection();

    expect(
      within(card()).getByRole('heading', { level: 2, name: 'General' }),
    ).toBeInTheDocument();
    expect(
      within(card()).getByText("The Project's name and look."),
    ).toBeInTheDocument();
    expect(within(card()).getByText('Fields')).toBeInTheDocument();
  });

  it('keeps the longer rules collapsed under "How this works"', async () => {
    renderSection({ help: <p>The longer rules.</p> });

    expect(screen.getByText('The longer rules.')).not.toBeVisible();

    await userEvent.click(screen.getByText('How this works'));

    expect(screen.getByText('The longer rules.')).toBeVisible();
  });

  it('shows no "How this works" without help', () => {
    renderSection();

    expect(screen.queryByText('How this works')).toBeNull();
  });

  it('offers Save and Discard only while it has unsaved edits, and marks its tab', async () => {
    const onDiscard = vi.fn();
    const { rerender } = renderSection({ dirty: false, onDiscard });

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'Unsaved changes' })).toBeNull();

    rerender(
      <ProjectSettings
        hasRepository
        panels={{
          general: (
            <form aria-label="General settings">
              <SettingsSection
                section="general"
                title="General"
                description="The Project's name and look."
                dirty
                onDiscard={onDiscard}
              >
                <p>Fields</p>
              </SettingsSection>
            </form>
          ),
          repository: null,
          agent: null,
          automation: null,
          commands: null,
          references: null,
        }}
      />,
    );

    expect(
      within(card()).getByRole('button', { name: 'Save' }),
    ).toHaveAttribute('type', 'submit');
    expect(
      within(screen.getByRole('tablist')).getByRole('img', {
        name: 'Unsaved changes',
      }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(card()).getByRole('button', { name: 'Discard' }),
    );

    expect(onDiscard).toHaveBeenCalled();
  });

  it('shows Save as busy while saving', () => {
    renderSection({ dirty: true, saving: true });

    expect(within(card()).getByRole('button', { name: /Save/ })).toBeDisabled();
  });

  it('points to the Repository tab while locked without a repository path', async () => {
    renderSection({ locked: true });

    expect(
      within(card()).getByText(/Set a repository path first/),
    ).toBeInTheDocument();

    await userEvent.click(
      within(card()).getByRole('link', { name: '→ Repository' }),
    );

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Repository',
    );
    expect(window.location.search).toBe('?section=repository');
  });
});
