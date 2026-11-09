import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendSparTurn } from '../../app/spars/actions';
import { renderWithTheme } from '../../test/render';
import { SparTurnBar } from './spar-turn-bar';

vi.mock('../../app/spars/actions', () => ({ sendSparTurn: vi.fn() }));

describe('SparTurnBar', () => {
  beforeEach(() => {
    vi.mocked(sendSparTurn)
      .mockReset()
      .mockResolvedValue({
        ok: true,
        conversation: {} as never,
      });
  });

  it('hands the turn over with Your move, sending no text of its own', async () => {
    renderWithTheme(<SparTurnBar sparId={4} />);

    await userEvent.click(screen.getByRole('button', { name: 'Your move' }));

    expect(sendSparTurn).toHaveBeenCalledWith({ sparId: 4, text: '' });
  });

  it('shows a refusal', async () => {
    vi.mocked(sendSparTurn).mockResolvedValue({
      ok: false,
      error: 'This Spar is closed.',
    });
    renderWithTheme(<SparTurnBar sparId={4} />);

    await userEvent.click(screen.getByRole('button', { name: 'Your move' }));

    expect(await screen.findByText('This Spar is closed.')).toBeInTheDocument();
  });
});
