import { act, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startBatchTriage } from '../../app/conversations/actions';
import { renderWithTheme } from '../../test/render';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { BatchTriageButton } from './batch-triage-button';

vi.mock('../../app/conversations/actions', () => ({
  startBatchTriage: vi.fn(),
}));
vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));

const open = vi.fn();

describe('BatchTriageButton (T1318)', () => {
  beforeEach(() => {
    vi.mocked(startBatchTriage).mockReset();
    open.mockReset();
    vi.mocked(useConversationDialog).mockReturnValue({
      conversations: [],
      open,
      show: vi.fn(),
      reopenAndOpen: vi.fn(),
      openDraft: vi.fn(),
      shown: false,
    });
  });

  it("shows the Board's count of Tickets to triage", () => {
    renderWithTheme(
      <BatchTriageButton projectId={3} cycleId={7} count={4} openId={null} />,
    );

    expect(
      screen.getByRole('button', { name: 'Triage 4' }),
    ).toBeInTheDocument();
  });

  it('is hidden with nothing to triage and no Batch triage open', () => {
    renderWithTheme(
      <BatchTriageButton projectId={3} cycleId={7} count={0} openId={null} />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('starts a Batch triage of the Board and opens its Conversation', async () => {
    const user = userEvent.setup();
    vi.mocked(startBatchTriage).mockResolvedValue({
      ok: true,
      conversation: { id: 31 } as never,
    });
    renderWithTheme(
      <BatchTriageButton
        projectId={3}
        cycleId={null}
        count={2}
        openId={null}
      />,
    );

    await act(() =>
      user.click(screen.getByRole('button', { name: 'Triage 2' })),
    );

    expect(startBatchTriage).toHaveBeenCalledWith({
      projectId: 3,
      cycleId: null,
    });
    expect(open).toHaveBeenCalledWith(31);
  });

  it('opens the Batch triage open for the Board and starts nothing', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <BatchTriageButton projectId={3} cycleId={7} count={0} openId={12} />,
    );

    await user.click(screen.getByRole('button', { name: 'Open Batch triage' }));

    expect(open).toHaveBeenCalledWith(12);
    expect(startBatchTriage).not.toHaveBeenCalled();
  });

  it("shows the Server Action's refusal", async () => {
    const user = userEvent.setup();
    vi.mocked(startBatchTriage).mockResolvedValue({
      ok: false,
      error: 'This Board has nothing to triage.',
    });
    renderWithTheme(
      <BatchTriageButton projectId={3} cycleId={7} count={1} openId={null} />,
    );

    await user.click(screen.getByRole('button', { name: 'Triage 1' }));

    expect(
      await screen.findByText('This Board has nothing to triage.'),
    ).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
});
