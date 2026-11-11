// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appConversations } from '../../../../conversations/app-conversations';
import { agentCommandEntries } from '../../../../test/fixtures';
import {
  renderPage,
  renderPageError,
  renderWithTheme,
} from '../../../../test/render';
import { createTestTickets } from '../../../../test/tickets';
import type { ProjectAgentCommands } from '../../../../tickets/agent-commands';
import { appTickets } from '../../../../tickets/app-tickets';
import SettingsPage, { generateMetadata } from './page';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock('../../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock(
  '../../../../components/reference-template-editor/reference-template-editor',
  () => ({
    ReferenceTemplateEditor: ({
      projectId,
      templates,
    }: {
      projectId: number;
      templates: { prefix: string }[];
    }) => (
      <p>{`Templates of ${projectId}: ${templates.map(({ prefix }) => prefix).join(' ')}`}</p>
    ),
  }),
);

type SectionProps = {
  settings: { agentMode: boolean; repositoryPath: string | null };
  latestSetup?: { id: number } | null;
};

vi.mock('../../../../components/general-settings/general-settings', () => ({
  GeneralSettings: ({ project }: { project: { name: string } }) => (
    <p>{`General of ${project.name}`}</p>
  ),
}));
vi.mock(
  '../../../../components/repository-settings/repository-settings',
  () => ({
    RepositorySettings: ({ settings, latestSetup }: SectionProps) => (
      <p>{`Repository ${settings.repositoryPath ?? 'unset'}, Setup ${latestSetup?.id ?? 'none'}`}</p>
    ),
  }),
);
vi.mock('../../../../components/agent-settings/agent-settings', () => ({
  AgentSettings: ({ settings, latestSetup }: SectionProps) => (
    <p>{`Agent mode ${settings.agentMode ? 'on' : 'off'}, Setup ${latestSetup?.id ?? 'none'}`}</p>
  ),
}));
vi.mock(
  '../../../../components/automation-settings/automation-settings',
  () => ({ AutomationSettings: () => <p>Automation section</p> }),
);

vi.mock(
  '../../../../components/agent-commands-form/agent-commands-form',
  () => ({
    AgentCommandsForm: ({
      projectId,
      commands,
    }: {
      projectId: number;
      commands: ProjectAgentCommands;
    }) => (
      <p>{`Commands of ${projectId}: ${commands.triageCommand} ${commands.startCommand} ${commands.startEpicCommand}`}</p>
    ),
  }),
);

describe('SettingsPage', () => {
  beforeEach(() => {
    notFound.mockClear();
    vi.mocked(appConversations).mockReturnValue({
      list: () => [],
      agentKinds: () => [],
    } as unknown as ReturnType<typeof appConversations>);
  });

  it('shows the six sections as tabs, opening on Repository while no path is saved', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({ id: String(project.id) });
    await renderPage(<main>{await SettingsPage({ params })}</main>);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'General',
      'Repository',
      'Agent',
      'Automation',
      'Commands',
      'References',
    ]);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Repository',
    );
    expect(screen.getByText('General of Website')).toBeInTheDocument();
    expect(screen.getByText('Automation section')).toBeInTheDocument();
    // The Project's layout shows its header and tabs.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    await expect(generateMetadata({ params })).resolves.toEqual({
      title: 'Settings · Website',
    });
  });

  it('opens on General once a repository path is saved', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(project.id, { repositoryPath: '/' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({ id: String(project.id) });
    await renderPage(<main>{await SettingsPage({ params })}</main>);

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'General',
    );
    expect(screen.getByText('Repository /, Setup none')).toBeInTheDocument();
  });

  it("shows the Project's Reference templates in their card", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.addReferenceTemplate(project.id, {
      prefix: '#',
      url: 'https://github.com/acme/web/issues/{n}',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({ id: String(project.id) });
    await renderPage(<main>{await SettingsPage({ params })}</main>);

    const card = screen.getByRole('region', {
      name: 'References',
      hidden: true,
    });
    expect(
      within(card).getByText(`Templates of ${project.id}: #`),
    ).toBeInTheDocument();
    expect(
      within(card).getByText(
        'Turn External reference keys such as #55 into links.',
      ),
    ).toBeInTheDocument();
    expect(
      within(card).getByText(/The first matching template/),
    ).not.toBeVisible();
  });

  it('has no Skills section (T1340)', async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({ id: String(project.id) });
    await renderPage(<main>{await SettingsPage({ params })}</main>);

    expect(screen.queryByRole('tab', { name: 'Skills' })).toBeNull();
    expect(screen.queryByText(/Skills? chips?/i)).not.toBeInTheDocument();
  });

  it("shows the Project's Triage and Start commands", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentCommands(
      project.id,
      agentCommandEntries({
        triageCommand: '/triage',
        startCommand: '/implement',
      }),
    );
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({ id: String(project.id) });
    await renderPage(<main>{await SettingsPage({ params })}</main>);

    expect(
      screen.getByText(`Commands of ${project.id}: /triage /implement null`),
    ).toBeInTheDocument();
  });

  it("gives Repository and Agent the Project's latest Setup", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);
    vi.mocked(appConversations).mockReturnValue({
      list: () => [
        { id: 9, intent: 'ask' },
        { id: 7, intent: 'setup' },
        { id: 2, intent: 'setup' },
      ],
      agentKinds: () => [],
    } as unknown as ReturnType<typeof appConversations>);

    const params = Promise.resolve({ id: String(project.id) });
    await renderPage(<main>{await SettingsPage({ params })}</main>);

    expect(screen.getByText('Agent mode off, Setup 7')).toBeInTheDocument();
    expect(screen.getByText('Repository unset, Setup 7')).toBeInTheDocument();
  });

  it('shows the loading state until the Project loads', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    renderWithTheme(
      <main>{await SettingsPage({ params: new Promise(() => {}) })}</main>,
    );

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('returns not-found for a missing Project', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    await expect(
      renderPageError(
        <main>
          {await SettingsPage({ params: Promise.resolve({ id: '999' }) })}
        </main>,
      ),
    ).resolves.toMatchObject({ message: 'NEXT_NOT_FOUND' });
    expect(notFound).toHaveBeenCalledOnce();
  });
});
