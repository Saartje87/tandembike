import { act, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentConversationActivity } from '../../app/conversations/actions';
import { activity } from '../../test/conversation-activity';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { LiveUpdates } from '../live-updates/live-updates';
import {
  ConversationActivityProvider,
  useTicketActivity,
} from './conversation-activity';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../../app/conversations/actions', () => ({
  currentConversationActivity: vi.fn(),
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
}

const Probe = () => {
  const activity = useTicketActivity(4);
  return <p>{`running=${activity.running} waiting=${activity.waiting}`}</p>;
};

const show = () =>
  renderWithTheme(
    <LiveUpdates>
      <ConversationActivityProvider>
        <Probe />
      </ConversationActivityProvider>
    </LiveUpdates>,
  );

describe('ConversationActivityProvider', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.mocked(useRouter).mockReturnValue(mockRouter());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(currentConversationActivity).mockReset();
  });

  it('starts with nothing running or waiting', () => {
    vi.mocked(currentConversationActivity).mockReturnValue(
      new Promise(() => {}),
    );
    show();

    expect(screen.getByText('running=false waiting=false')).toBeInTheDocument();
  });

  it('loads the activity, and loads it again when a Conversation changes', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      activity({ running: [4] }),
    );
    show();
    expect(
      await screen.findByText('running=true waiting=false'),
    ).toBeInTheDocument();

    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      activity({ waiting: [4], waitingCount: 2 }),
    );
    act(() => {
      FakeEventSource.instances[0]?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'conversation', id: 1 }),
        }),
      );
    });

    await waitFor(() =>
      expect(
        screen.getByText('running=false waiting=true'),
      ).toBeInTheDocument(),
    );
  });
});
