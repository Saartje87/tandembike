import { act, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startRetro } from '../../app/conversations/actions';
import { archiveCycle } from '../../app/cycles/actions';
import type { Conversation } from '../../conversations/conversations';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { CycleCompleteBanner } from './cycle-complete-banner';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../../app/conversations/actions', () => ({ startRetro: vi.fn() }));
vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));
vi.mock('../../app/cycles/actions', () => ({ archiveCycle: vi.fn() }));

const cycle = { id: 7, projectId: 3, title: 'Launch the beta' };

const retroConversation = (
  overrides: Partial<Conversation> = {},
): Conversation => ({
  id: 21,
  projectId: 3,
  ticketNumber: null,
  intent: 'retro',
  state: 'idle',
  startedBy: 'user',
  sdkSessionId: null,
  costUsd: 0,
  hidden: false,
  retroCycleId: 7,
  defaultCycleId: null,
  defaultEpicNumber: null,
  defaultType: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const control = () => ({
  conversations: [],
  open: vi.fn(),
  show: vi.fn(),
  reopenAndOpen: vi.fn().mockResolvedValue(undefined),
  openDraft: vi.fn(),
  shown: false,
});

describe('CycleCompleteBanner', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    vi.mocked(archiveCycle).mockReset();
    vi.restoreAllMocks();
    vi.mocked(startRetro).mockReset();
    vi.mocked(useConversationDialog).mockReturnValue(control());
  });

  it('says the Cycle is complete', () => {
    renderWithTheme(<CycleCompleteBanner cycle={cycle} retro={null} />);

    expect(screen.getByText(/Launch the beta.*complete/)).toBeInTheDocument();
  });

  it('archives after confirmation and goes to the Backlog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(archiveCycle).mockResolvedValue({ ok: true });
    renderWithTheme(<CycleCompleteBanner cycle={cycle} retro={null} />);

    await act(() =>
      userEvent.click(screen.getByRole('button', { name: 'Archive Cycle' })),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      'Archive the Cycle "Launch the beta"? Its unfinished Tickets go back to the Backlog.',
    );
    expect(archiveCycle).toHaveBeenCalledWith({ cycleId: 7 });
    expect(router.push).toHaveBeenCalledWith('/project/3');
  });

  it('archives nothing when the User declines', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithTheme(<CycleCompleteBanner cycle={cycle} retro={null} />);

    await act(() =>
      userEvent.click(screen.getByRole('button', { name: 'Archive Cycle' })),
    );

    expect(archiveCycle).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows a refusal and stays', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(archiveCycle).mockResolvedValue({
      ok: false,
      error: 'Not allowed.',
    });
    renderWithTheme(<CycleCompleteBanner cycle={cycle} retro={null} />);

    await act(() =>
      userEvent.click(screen.getByRole('button', { name: 'Archive Cycle' })),
    );

    expect(screen.getByText('Not allowed.')).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('starts a Retro and opens it in the Conversation dialog', async () => {
    const dialog = control();
    vi.mocked(useConversationDialog).mockReturnValue(dialog);
    vi.mocked(startRetro).mockResolvedValue({
      ok: true,
      conversation: retroConversation(),
    });
    renderWithTheme(<CycleCompleteBanner cycle={cycle} retro={null} />);

    await act(() =>
      userEvent.click(screen.getByRole('button', { name: 'Start Retro' })),
    );

    expect(startRetro).toHaveBeenCalledWith({ cycleId: 7 });
    expect(dialog.open).toHaveBeenCalledWith(21);
  });

  it('shows the reason when starting a Retro is refused', async () => {
    const dialog = control();
    vi.mocked(useConversationDialog).mockReturnValue(dialog);
    vi.mocked(startRetro).mockResolvedValue({
      ok: false,
      error: 'This Cycle already has a Retro.',
    });
    renderWithTheme(<CycleCompleteBanner cycle={cycle} retro={null} />);

    await act(() =>
      userEvent.click(screen.getByRole('button', { name: 'Start Retro' })),
    );

    expect(
      screen.getByText('This Cycle already has a Retro.'),
    ).toBeInTheDocument();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('offers Open Retro instead once the Cycle has one', async () => {
    const dialog = control();
    vi.mocked(useConversationDialog).mockReturnValue(dialog);
    const retro = retroConversation();
    renderWithTheme(<CycleCompleteBanner cycle={cycle} retro={retro} />);

    expect(
      screen.queryByRole('button', { name: 'Start Retro' }),
    ).not.toBeInTheDocument();
    await act(() =>
      userEvent.click(screen.getByRole('button', { name: 'Open Retro' })),
    );

    expect(dialog.reopenAndOpen).toHaveBeenCalledWith(retro);
  });
});
