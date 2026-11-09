import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { approveTriage, rejectTriage } from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import type { TriageProposal as Proposal } from '../../tickets/triage-proposals';
import { TriageProposal } from './triage-proposal';

vi.mock('../../app/tickets/actions', () => ({
  approveTriage: vi.fn(),
  rejectTriage: vi.fn(),
}));

const proposal: Proposal = {
  id: 7,
  ticketNumber: 3,
  runId: '5',
  category: 'bug',
  state: 'ready-for-agent',
  reasoning: 'The header **overlaps**.',
  acceptanceCriteria: ['Fits at 320px'],
  duplicateOf: null,
  splits: null,
  status: 'pending',
  createdAt: new Date('2026-03-01T09:00:00Z'),
  decidedAt: null,
};

describe('TriageProposal', () => {
  beforeEach(() => {
    vi.mocked(approveTriage).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(rejectTriage).mockReset().mockResolvedValue({ ok: true });
  });

  it('shows the proposed values, the reasoning as Markdown and the criteria', () => {
    renderWithTheme(<TriageProposal proposal={proposal} />);

    expect(screen.getByLabelText('Category')).toHaveValue('bug');
    expect(screen.getByLabelText('State')).toHaveValue('ready-for-agent');
    expect(screen.getByText('overlaps').tagName).toBe('STRONG');
    expect(screen.getByText('Fits at 320px')).toBeInTheDocument();
  });

  it('approves with an edited state', async () => {
    const user = userEvent.setup();
    renderWithTheme(<TriageProposal proposal={proposal} />);

    await user.selectOptions(screen.getByLabelText('State'), 'ready-for-human');
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(approveTriage).toHaveBeenCalledWith({
        id: 7,
        category: 'bug',
        state: 'ready-for-human',
      }),
    );
  });

  it('rejects with a reason', async () => {
    const user = userEvent.setup();
    renderWithTheme(<TriageProposal proposal={proposal} />);

    await user.type(
      screen.getByLabelText('Reason for rejecting (optional)'),
      'Not a bug',
    );
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(rejectTriage).toHaveBeenCalledWith({ id: 7, reason: 'Not a bug' }),
    );
  });

  it('shows a refusal', async () => {
    vi.mocked(approveTriage).mockResolvedValue({
      ok: false,
      error: 'T3 is In progress; only a Todo Ticket can be triaged.',
    });
    const user = userEvent.setup();
    renderWithTheme(<TriageProposal proposal={proposal} />);

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'only a Todo Ticket',
    );
  });
});
