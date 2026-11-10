import { act, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  archiveCycle,
  discardCycle,
  renameCycle,
  startCycle,
} from '../../app/cycles/actions';
import type { Conversation } from '../../conversations/conversations';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import type { Cycle } from '../../tickets/cycles';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { CycleHeader } from './cycle-header';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../../app/cycles/actions', () => ({
  archiveCycle: vi.fn(),
  discardCycle: vi.fn(),
  renameCycle: vi.fn(),
  startCycle: vi.fn(),
}));
vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));

const prepared: Cycle = {
  id: 7,
  projectId: 3,
  title: 'Launch the beta',
  state: 'Prepared',
  ticketNumbers: [],
  createdAt: new Date('2026-01-01'),
  archivedAt: null,
};

const dialogControl = () => ({
  conversations: [],
  open: vi.fn(),
  show: vi.fn(),
  reopenAndOpen: vi.fn().mockResolvedValue(undefined),
  openDraft: vi.fn(),
  shown: false,
});

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
  batchTriageCycleId: null,
  batchTriageTickets: null,
  defaultCycleId: null,
  defaultEpicNumber: null,
  defaultType: null,
  worktreePath: null,
  worktreeKept: null,
  worktreeRemoved: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('CycleHeader', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    vi.mocked(renameCycle).mockReset();
    vi.mocked(discardCycle).mockReset();
    vi.mocked(startCycle).mockReset();
    vi.mocked(archiveCycle).mockReset();
    vi.mocked(useConversationDialog).mockReturnValue(dialogControl());
    vi.restoreAllMocks();
  });

  it("shows the Cycle's title and state", () => {
    renderWithTheme(<CycleHeader cycle={prepared} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Launch the beta' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Prepared')).toBeInTheDocument();
  });

  const title = () => screen.getByRole('button', { name: 'Launch the beta' });
  const titleInput = () => screen.getByRole('textbox', { name: 'Cycle title' });

  it('shows the actions it is given beside its own buttons (T1318)', () => {
    renderWithTheme(
      <CycleHeader
        cycle={prepared}
        actions={<button type="button">Triage 2</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Triage 2' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start Cycle' })).toBeVisible();
  });

  it('has no Rename button; the title says it can be edited', () => {
    renderWithTheme(<CycleHeader cycle={prepared} />);

    expect(
      screen.queryByRole('button', { name: 'Rename' }),
    ).not.toBeInTheDocument();
    expect(title()).toHaveAccessibleDescription('Edit cycle title');
  });

  it('opens the title on click and saves on Enter, showing the new title at once', async () => {
    const save = Promise.withResolvers<{ ok: true }>();
    vi.mocked(renameCycle).mockReturnValue(save.promise);
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(title());
    expect(titleInput()).toHaveValue('Launch the beta');
    await userEvent.clear(titleInput());
    await userEvent.type(titleInput(), 'Public beta{Enter}');

    expect(renameCycle).toHaveBeenCalledExactlyOnceWith({
      cycleId: 7,
      title: 'Public beta',
    });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Public beta' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await act(async () => save.resolve({ ok: true }));
  });

  it('opens the title on Enter when focused', async () => {
    renderWithTheme(<CycleHeader cycle={prepared} />);

    title().focus();
    await userEvent.keyboard('{Enter}');

    expect(titleInput()).toHaveValue('Launch the beta');
  });

  it("reopens a refused rename with the User's text and the reason", async () => {
    vi.mocked(renameCycle).mockResolvedValue({
      ok: false,
      error: 'Enter a title.',
      fieldErrors: { title: 'Enter a title.' },
    });
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(title());
    await userEvent.clear(titleInput());
    await userEvent.type(titleInput(), ' {Enter}');

    expect(await screen.findByText('Enter a title.')).toBeInTheDocument();
    expect(titleInput()).toHaveValue(' ');
    expect(titleInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the general reason when a refusal names no field', async () => {
    vi.mocked(renameCycle).mockResolvedValue({
      ok: false,
      error: 'There is no Cycle with id 7.',
    });
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(title());
    await userEvent.type(titleInput(), '!{Enter}');

    expect(
      await screen.findByText('There is no Cycle with id 7.'),
    ).toBeInTheDocument();
    expect(titleInput()).toHaveValue('Launch the beta!');
  });

  it('cancels a rename with Escape', async () => {
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(title());
    await userEvent.type(titleInput(), 'x{Escape}');

    expect(renameCycle).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Launch the beta' }),
    ).toBeInTheDocument();
  });

  it('discards a Prepared Cycle after confirming, and goes to the Backlog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(discardCycle).mockResolvedValue({ ok: true });
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Discard Cycle' }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      'Discard the Cycle "Launch the beta"? Its Tickets go back to the Backlog.',
    );
    expect(discardCycle).toHaveBeenCalledWith({ cycleId: 7 });
    expect(router.push).toHaveBeenCalledWith('/project/3');
  });

  it('keeps the Cycle when the User declines to discard it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Discard Cycle' }),
    );

    expect(discardCycle).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows why discarding was refused', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(discardCycle).mockResolvedValue({
      ok: false,
      error: 'There is no Cycle with id 7.',
    });
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Discard Cycle' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no Cycle with id 7.',
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('starts a Prepared Cycle', async () => {
    vi.mocked(startCycle).mockResolvedValue({ ok: true });
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(screen.getByRole('button', { name: 'Start Cycle' }));

    expect(startCycle).toHaveBeenCalledExactlyOnceWith({ cycleId: 7 });
  });

  it('shows why starting was refused', async () => {
    vi.mocked(startCycle).mockResolvedValue({
      ok: false,
      error:
        'The Cycle "Beta" is Active. Starting another archives it, so confirm that first.',
    });
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(screen.getByRole('button', { name: 'Start Cycle' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Cycle "Beta" is Active. Starting another archives it, so confirm that first.',
    );
  });

  it('keeps an Active Cycle renameable, with no Start or Discard', () => {
    renderWithTheme(<CycleHeader cycle={{ ...prepared, state: 'Active' }} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(title()).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start Cycle' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Discard Cycle' }),
    ).not.toBeInTheDocument();
  });

  it('archives an Active Cycle after confirming, and goes to the Backlog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(archiveCycle).mockResolvedValue({ ok: true });
    renderWithTheme(<CycleHeader cycle={{ ...prepared, state: 'Active' }} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Archive Cycle' }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      'Archive the Cycle "Launch the beta"? Its unfinished Tickets go back to the Backlog.',
    );
    expect(archiveCycle).toHaveBeenCalledExactlyOnceWith({ cycleId: 7 });
    expect(router.push).toHaveBeenCalledWith('/project/3');
  });

  it('keeps an Active Cycle when the User declines to archive it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithTheme(<CycleHeader cycle={{ ...prepared, state: 'Active' }} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Archive Cycle' }),
    );

    expect(archiveCycle).not.toHaveBeenCalled();
  });

  it('shows an Archived Cycle read-only, with when it was archived', async () => {
    renderWithTheme(
      <CycleHeader
        cycle={{
          ...prepared,
          state: 'Archived',
          archivedAt: new Date('2026-03-04T12:00:00Z'),
        }}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Launch the beta' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Archived/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit cycle title')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Launch the beta'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  describe('over an Archived Cycle with a Retro', () => {
    const archived: Cycle = {
      ...prepared,
      state: 'Archived',
      archivedAt: new Date('2026-03-04T12:00:00Z'),
    };

    it.each([
      ['open', false],
      ['closed', true],
    ])(
      'opens its Retro whose tab is %s in the Conversation dialog',
      async (_, hidden) => {
        const dialog = dialogControl();
        vi.mocked(useConversationDialog).mockReturnValue(dialog);
        const retro = retroConversation({ hidden });
        renderWithTheme(<CycleHeader cycle={archived} retro={retro} />);

        await act(() =>
          userEvent.click(screen.getByRole('button', { name: 'Open Retro' })),
        );

        expect(dialog.reopenAndOpen).toHaveBeenCalledExactlyOnceWith(retro);
      },
    );

    it('shows why the Retro could not be opened', async () => {
      const dialog = dialogControl();
      dialog.reopenAndOpen.mockResolvedValue('The Retro could not reopen');
      vi.mocked(useConversationDialog).mockReturnValue(dialog);
      renderWithTheme(
        <CycleHeader cycle={archived} retro={retroConversation()} />,
      );

      await act(() =>
        userEvent.click(screen.getByRole('button', { name: 'Open Retro' })),
      );

      expect(screen.getByRole('alert')).toHaveTextContent(
        'The Retro could not reopen',
      );
    });

    it('shows no Open Retro without a Retro', () => {
      renderWithTheme(<CycleHeader cycle={archived} retro={null} />);

      expect(
        screen.queryByRole('button', { name: 'Open Retro' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('over an Active Cycle', () => {
    const active: Cycle = {
      ...prepared,
      id: 6,
      title: 'Beta',
      state: 'Active',
    };

    it('asks to archive the Active Cycle, then starts with rollover', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(startCycle).mockResolvedValue({ ok: true });
      renderWithTheme(<CycleHeader cycle={prepared} activeCycle={active} />);

      await userEvent.click(
        screen.getByRole('button', { name: 'Start Cycle' }),
      );

      expect(window.confirm).toHaveBeenCalledWith(
        'Start "Launch the beta" and archive the Active Cycle "Beta"? Its open Tickets move to "Launch the beta".',
      );
      expect(startCycle).toHaveBeenCalledExactlyOnceWith({
        cycleId: 7,
        archiveActive: true,
        activeCycleId: 6,
      });
    });

    it('changes nothing when the User declines', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderWithTheme(<CycleHeader cycle={prepared} activeCycle={active} />);

      await userEvent.click(
        screen.getByRole('button', { name: 'Start Cycle' }),
      );

      expect(startCycle).not.toHaveBeenCalled();
    });
  });

  describe('estimate', () => {
    it('shows the Estimate on a Prepared Cycle', () => {
      renderWithTheme(
        <CycleHeader
          cycle={prepared}
          estimate={{ totalUsd: 12.6, units: 3 }}
        />,
      );

      expect(
        screen.getByText('Estimated ≈ $12.60 for 3 Tickets'),
      ).toBeInTheDocument();
    });

    it('counts one Ticket in the singular', () => {
      renderWithTheme(
        <CycleHeader cycle={prepared} estimate={{ totalUsd: 4, units: 1 }} />,
      );

      expect(
        screen.getByText('Estimated ≈ $4.00 for 1 Ticket'),
      ).toBeInTheDocument();
    });

    it('says when there are too few runs to estimate', () => {
      renderWithTheme(
        <CycleHeader
          cycle={prepared}
          estimate={{ totalUsd: null, units: 3 }}
        />,
      );

      expect(
        screen.getByText('Not enough runs to estimate'),
      ).toBeInTheDocument();
    });

    it('shows none on an Active Cycle', () => {
      renderWithTheme(
        <CycleHeader
          cycle={{ ...prepared, state: 'Active' }}
          estimate={{ totalUsd: 4, units: 1 }}
        />,
      );

      expect(screen.queryByText(/Estimated/)).not.toBeInTheDocument();
    });
  });
});
