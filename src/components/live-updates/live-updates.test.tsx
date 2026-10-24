import { act, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import type { Change } from '../../tickets/changes';
import type { Ticket } from '../../tickets/tickets';
import { TicketCard } from '../ticket-card/ticket-card';
import { LiveUpdates } from './live-updates';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

/** Stands in for the browser's `EventSource`; tests drive it by hand. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  announce(change: Change) {
    act(() => {
      this.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify(change) }),
      );
    });
  }

  /** The connection drops, then the browser reconnects by itself. */
  reconnect() {
    act(() => {
      this.onerror?.(new Event('error'));
      this.onopen?.(new Event('open'));
    });
  }
}

const source = () => {
  const [only] = FakeEventSource.instances;
  return only;
};

const ticket = (number: number): Ticket => ({
  number,
  title: `Ticket ${number}`,
  description: '',
  status: 'Todo',
  projectId: 1,
  position: 0,
  archived: false,
  labels: [],
  blockedBy: [],
  blocked: false,
  claim: null,
  acceptanceCriteria: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
});

const card = (number: number) =>
  screen.getByRole('link', { name: `Ticket ${number}` }).closest('li');

let router: ReturnType<typeof useRouter>;

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  router = mockRouter();
  vi.mocked(useRouter).mockReturnValue(router);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const renderBoardCards = () =>
  renderWithTheme(
    <LiveUpdates>
      <ul>
        <TicketCard ticket={ticket(4)} />
        <TicketCard ticket={ticket(5)} />
      </ul>
    </LiveUpdates>,
  );

describe('LiveUpdates', () => {
  it('listens to /api/events', () => {
    renderBoardCards();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(source().url).toBe('/api/events');
  });

  it('refetches and briefly highlights the card of a changed Ticket', () => {
    vi.useFakeTimers();
    renderBoardCards();

    source().announce({ type: 'ticket', number: 4 });

    expect(router.refresh).toHaveBeenCalledOnce();
    expect(card(4)).toHaveAttribute('data-changed');
    expect(card(5)).not.toHaveAttribute('data-changed');

    act(() => vi.advanceTimersByTime(2000));

    expect(card(4)).not.toHaveAttribute('data-changed');
  });

  it('keeps highlighting a Ticket that changes again', () => {
    vi.useFakeTimers();
    renderBoardCards();

    source().announce({ type: 'ticket', number: 4 });
    act(() => vi.advanceTimersByTime(1500));
    source().announce({ type: 'ticket', number: 4 });
    act(() => vi.advanceTimersByTime(1500));

    expect(card(4)).toHaveAttribute('data-changed');
  });

  it('refetches once and highlights every Ticket changed in a batch', () => {
    renderBoardCards();

    source().announce({ type: 'tickets', numbers: [4, 5] });

    expect(router.refresh).toHaveBeenCalledOnce();
    expect(card(4)).toHaveAttribute('data-changed');
    expect(card(5)).toHaveAttribute('data-changed');
  });

  it('refetches on a Project change without highlighting any card', () => {
    renderBoardCards();

    source().announce({ type: 'project', id: 1 });

    expect(router.refresh).toHaveBeenCalledOnce();
    expect(card(4)).not.toHaveAttribute('data-changed');
    expect(card(5)).not.toHaveAttribute('data-changed');
  });

  it('refetches after reconnecting, to catch up on missed changes', () => {
    renderBoardCards();

    source().reconnect();

    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('does not refetch when it first connects', () => {
    renderBoardCards();

    act(() => source().onopen?.(new Event('open')));

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('stops listening when it unmounts', () => {
    const { unmount } = renderBoardCards();

    unmount();

    expect(source().close).toHaveBeenCalledOnce();
  });
});
