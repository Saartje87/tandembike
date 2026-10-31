import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appConversations } from '../../../../conversations/app-conversations';
import {
  renderPage,
  renderPageError,
  renderWithTheme,
} from '../../../../test/render';
import { createTestTickets } from '../../../../test/tickets';
import { appTickets } from '../../../../tickets/app-tickets';
import SettingsPage, { generateMetadata } from './page';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound }));
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

vi.mock(
  '../../../../components/agent-settings-form/agent-settings-form',
  () => ({
    AgentSettingsForm: ({
      settings,
      latestSetup,
    }: {
      settings: { agentMode: boolean };
      latestSetup: { id: number } | null;
    }) => (
      <p>{`Agent mode ${settings.agentMode ? 'on' : 'off'}, Setup ${latestSetup?.id ?? 'none'}`}</p>
    ),
  }),
);

describe('SettingsPage', () => {
  beforeEach(() => {
    notFound.mockClear();
    vi.mocked(appConversations).mockReturnValue({
      list: () => [],
    } as unknown as ReturnType<typeof appConversations>);
  });

  it("shows the Project's Reference templates", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.addReferenceTemplate(project.id, {
      prefix: '#',
      url: 'https://github.com/acme/web/issues/{n}',
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({ id: String(project.id) });
    await renderPage(<main>{await SettingsPage({ params })}</main>);

    expect(screen.getByText('Agent mode off, Setup none')).toBeInTheDocument();
    // The Project's layout shows its header and tabs.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Reference templates' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Templates of ${project.id}: #`),
    ).toBeInTheDocument();
    await expect(generateMetadata({ params })).resolves.toEqual({
      title: 'Settings · Website',
    });
  });

  it("gives the agent settings the Project's latest Setup", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    vi.mocked(appTickets).mockReturnValue(tickets);
    vi.mocked(appConversations).mockReturnValue({
      list: () => [
        { id: 9, intent: 'ask' },
        { id: 7, intent: 'setup' },
        { id: 2, intent: 'setup' },
      ],
    } as unknown as ReturnType<typeof appConversations>);

    const params = Promise.resolve({ id: String(project.id) });
    await renderPage(<main>{await SettingsPage({ params })}</main>);

    expect(screen.getByText('Agent mode off, Setup 7')).toBeInTheDocument();
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
