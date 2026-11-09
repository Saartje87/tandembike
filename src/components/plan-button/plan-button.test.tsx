import { act, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startPlan } from '../../app/conversations/actions';
import { renderWithTheme } from '../../test/render';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { PlanButton } from './plan-button';

vi.mock('../../app/conversations/actions', () => ({ startPlan: vi.fn() }));
vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));

const open = vi.fn();

describe('PlanButton (T1248)', () => {
  beforeEach(() => {
    vi.mocked(startPlan).mockReset();
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

  it('asks for a goal and starts the Plan Conversation', async () => {
    const user = userEvent.setup();
    vi.mocked(startPlan).mockResolvedValue({
      ok: true,
      conversation: { id: 31 } as never,
    });
    renderWithTheme(<PlanButton projectId={3} />);

    await user.click(screen.getByRole('button', { name: 'Plan' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Goal' }),
      'Ship the beta',
    );
    await act(() =>
      user.click(screen.getByRole('button', { name: 'Start planning' })),
    );

    expect(startPlan).toHaveBeenCalledWith({
      projectId: 3,
      goal: 'Ship the beta',
    });
    expect(open).toHaveBeenCalledWith(31);
  });

  it("shows the Server Action's refusal and keeps the goal", async () => {
    const user = userEvent.setup();
    vi.mocked(startPlan).mockResolvedValue({
      ok: false,
      error: 'Describe the goal to plan for.',
      fieldErrors: { goal: 'Describe the goal to plan for.' },
    });
    renderWithTheme(<PlanButton projectId={3} />);

    await user.click(screen.getByRole('button', { name: 'Plan' }));
    await user.type(screen.getByRole('textbox', { name: 'Goal' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Start planning' }));

    expect(
      await screen.findByText('Describe the goal to plan for.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Goal' })).toHaveValue('x');
    expect(open).not.toHaveBeenCalled();
  });
});
