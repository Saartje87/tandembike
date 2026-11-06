import { act, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { liveConversation } from '../../test/conversation-activity';
import { renderWithTheme } from '../../test/render';
import { StatusLine } from './status-line';

describe('StatusLine', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-07T10:12:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const live = liveConversation();

  it('shows what the run is doing and how long it has been going', () => {
    renderWithTheme(<StatusLine live={live} />);

    expect(screen.getByText('Reading board.tsx')).toBeInTheDocument();
    expect(screen.getByText('12m')).toBeInTheDocument();
  });

  it('shows the running cost next to the elapsed time', () => {
    renderWithTheme(<StatusLine live={{ ...live, cost: 0.42 }} />);

    expect(screen.getByText('12m · $0.42')).toBeInTheDocument();
  });

  it('shows no cost before the run has cost anything', () => {
    renderWithTheme(<StatusLine live={live} />);

    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('counts on once a minute', () => {
    renderWithTheme(<StatusLine live={live} />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('13m')).toBeInTheDocument();
  });

  it('shows the full line as a tooltip', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithTheme(<StatusLine live={live} />);

    await user.hover(screen.getByText('Reading board.tsx'));

    // jsdom has no popover top layer, so the tooltip counts as hidden.
    const tooltip = await screen.findByRole('tooltip', { hidden: true });
    expect(tooltip).toHaveTextContent('Reading board.tsx');
    expect(
      screen.getByText('Reading board.tsx', { selector: 'span' }),
    ).toHaveAttribute('aria-describedby', tooltip.id);
  });
});
