import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { startSpar } from '../../app/spars/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { SparButton } from './spar-button';

vi.mock('../../app/spars/actions', () => ({ startSpar: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

let router: ReturnType<typeof mockRouter>;

describe('SparButton', () => {
  beforeEach(() => {
    vi.mocked(startSpar).mockReset();
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
  });

  it('asks for an optional topic, starts the Spar and opens its page', async () => {
    const user = userEvent.setup();
    vi.mocked(startSpar).mockResolvedValue({
      ok: true,
      spar: { id: 12 } as never,
    });
    renderWithTheme(<SparButton projectId={3} />);

    await user.click(screen.getByRole('button', { name: 'Spar' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Topic (optional)' }),
      'Faster triage',
    );
    await user.click(screen.getByRole('button', { name: 'Start sparring' }));

    expect(startSpar).toHaveBeenCalledWith({
      projectId: 3,
      focusTicketNumber: null,
      topic: 'Faster triage',
    });
    expect(router.push).toHaveBeenCalledWith('/project/3/spar/12');
  });

  it('starts one about a Ticket with no topic', async () => {
    const user = userEvent.setup();
    vi.mocked(startSpar).mockResolvedValue({
      ok: true,
      spar: { id: 13 } as never,
    });
    renderWithTheme(
      <SparButton
        projectId={3}
        focusTicketNumber={42}
        label="Spar about this"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Spar about this' }));
    await user.click(screen.getByRole('button', { name: 'Start sparring' }));

    expect(startSpar).toHaveBeenCalledWith({
      projectId: 3,
      focusTicketNumber: 42,
      topic: '',
    });
  });

  it('shows a refusal under the topic', async () => {
    const user = userEvent.setup();
    vi.mocked(startSpar).mockResolvedValue({
      ok: false,
      error: 'Keep the topic to one line.',
      fieldErrors: { topic: 'Keep the topic to one line.' },
    });
    renderWithTheme(<SparButton projectId={3} />);

    await user.click(screen.getByRole('button', { name: 'Spar' }));
    await user.click(screen.getByRole('button', { name: 'Start sparring' }));

    expect(
      await screen.findByText('Keep the topic to one line.'),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows a start that throws as a refusal and keeps the topic (T1324)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    const user = userEvent.setup();
    vi.mocked(startSpar).mockRejectedValue(new Error('network down'));
    renderWithTheme(<SparButton projectId={3} />);

    await user.click(screen.getByRole('button', { name: 'Spar' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Topic (optional)' }),
      'Faster triage',
    );
    await user.click(screen.getByRole('button', { name: 'Start sparring' }));

    expect(
      await screen.findByText('The Spar could not be started. Try again.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Topic (optional)' }),
    ).toHaveValue('Faster triage');
    expect(
      screen.getByRole('button', { name: 'Start sparring' }),
    ).toBeEnabled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
