import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startSetup } from '../../app/conversations/actions';
import type {
  Conversation,
  OpenConversation,
} from '../../conversations/conversations';
import { renderWithTheme } from '../../test/render';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { ProjectSetup } from './project-setup';

vi.mock('../../app/conversations/actions', () => ({ startSetup: vi.fn() }));
vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));

const setupConversation = (
  overrides: Partial<Conversation> = {},
): Conversation => ({
  id: 8,
  projectId: 3,
  ticketNumber: null,
  intent: 'setup',
  state: 'idle',
  sdkSessionId: null,
  costUsd: 0,
  hidden: false,
  defaultCycleId: null,
  defaultEpicNumber: null,
  defaultType: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const control = (conversations: OpenConversation[] = []) => ({
  conversations,
  open: vi.fn(),
  show: vi.fn(),
  reopenAndOpen: vi.fn().mockResolvedValue(undefined),
  openDraft: vi.fn(),
});

describe('ProjectSetup', () => {
  beforeEach(() => {
    vi.mocked(startSetup).mockReset();
    vi.mocked(useConversationDialog).mockReturnValue(control());
  });

  it('shows nothing while agent mode is off', () => {
    renderWithTheme(
      <ProjectSetup
        projectId={3}
        agentMode={false}
        offer={null}
        latestSetup={null}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Run Setup' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Setup/)).not.toBeInTheDocument();
  });

  it('hints at Setup while agent mode is on and no Setup was held', () => {
    renderWithTheme(
      <ProjectSetup projectId={3} agentMode offer={null} latestSetup={null} />,
    );

    expect(screen.getByText(/has not been checked by Setup/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Run Setup' })).toBeVisible();
  });

  it('shows the call to action after a turn-on, without starting a Setup', () => {
    renderWithTheme(
      <ProjectSetup
        projectId={3}
        agentMode
        offer="agent-mode"
        latestSetup={null}
      />,
    );

    expect(screen.getByText(/Agent mode is on\./)).toBeVisible();
    expect(startSetup).not.toHaveBeenCalled();
  });

  it('runs Setup and opens its Conversation in the dialog', async () => {
    const dialog = control();
    vi.mocked(useConversationDialog).mockReturnValue(dialog);
    vi.mocked(startSetup).mockResolvedValue({
      ok: true,
      conversation: setupConversation({ id: 12 }),
    });
    renderWithTheme(
      <ProjectSetup projectId={3} agentMode offer={null} latestSetup={null} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Run Setup' }));

    await waitFor(() => expect(dialog.open).toHaveBeenCalledWith(12));
    expect(startSetup).toHaveBeenCalledWith({ projectId: 3 });
  });

  it('shows a refusal', async () => {
    vi.mocked(startSetup).mockResolvedValue({ ok: false, error: 'No path.' });
    renderWithTheme(
      <ProjectSetup projectId={3} agentMode offer={null} latestSetup={null} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Run Setup' }));

    expect(await screen.findByText('No path.')).toBeVisible();
  });

  it('shows the latest Setup with its state and opens it in the dialog', async () => {
    const dialog = control();
    vi.mocked(useConversationDialog).mockReturnValue(dialog);
    const latest = setupConversation({ state: 'waiting' });
    renderWithTheme(
      <ProjectSetup
        projectId={3}
        agentMode
        offer={null}
        latestSetup={latest}
      />,
    );

    expect(screen.getByText(/needs you/)).toBeVisible();
    expect(screen.queryByText(/has not been checked/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open Setup' }));

    expect(dialog.reopenAndOpen).toHaveBeenCalledWith(latest);
  });

  it('follows a newer open Setup of the dialog over the one the page loaded', () => {
    vi.mocked(useConversationDialog).mockReturnValue(
      control([
        {
          conversation: setupConversation({ id: 9, state: 'running' }),
          ticketTitle: null,
          projectName: 'Website',
          firstMessage: 'Check',
        },
        {
          conversation: setupConversation({
            id: 20,
            projectId: 4,
            state: 'stopped',
          }),
          ticketTitle: null,
          projectName: 'Other',
          firstMessage: 'Check',
        },
      ]),
    );
    renderWithTheme(
      <ProjectSetup
        projectId={3}
        agentMode
        offer={null}
        latestSetup={setupConversation({ id: 8, state: 'stopped' })}
      />,
    );

    expect(screen.getByText(/working/)).toBeVisible();
  });
});
