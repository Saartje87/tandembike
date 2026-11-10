// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

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

  it('shows a duplicate as a link to the Ticket', () => {
    renderWithTheme(
      <TriageProposal proposal={{ ...proposal, duplicateOf: 12 }} />,
    );

    expect(screen.getByRole('link', { name: 'T12' })).toHaveAttribute(
      'href',
      '/ticket/12',
    );
  });

  it('offers no State for a duplicate, since approving labels it wontfix', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <TriageProposal proposal={{ ...proposal, duplicateOf: 12 }} />,
    );

    expect(screen.queryByLabelText('State')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(approveTriage).toHaveBeenCalledWith({ id: 7, category: 'bug' }),
    );
  });

  it('shows splits with their titles and criteria', () => {
    renderWithTheme(
      <TriageProposal
        proposal={{
          ...proposal,
          splits: [
            { title: 'Part one', description: '', acceptanceCriteria: ['a1'] },
            { title: 'Part two', description: '', acceptanceCriteria: [] },
          ],
        }}
      />,
    );

    expect(screen.getByText('Part one')).toBeInTheDocument();
    expect(screen.getByText('a1')).toBeInTheDocument();
    expect(screen.getByText('Part two')).toBeInTheDocument();
  });

  it('shows an approval that throws as a refusal (T1321)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(approveTriage).mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithTheme(<TriageProposal proposal={proposal} />);

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The proposal could not be approved. Try again.',
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('keeps the reason and shows a refusal when rejecting throws (T1321)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(rejectTriage).mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithTheme(<TriageProposal proposal={proposal} />);

    await user.type(
      screen.getByLabelText('Reason for rejecting (optional)'),
      'Not a bug',
    );
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The proposal could not be rejected. Try again.',
    );
    expect(
      screen.getByLabelText('Reason for rejecting (optional)'),
    ).toHaveValue('Not a bug');
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });
});
