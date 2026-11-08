import { act, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentConversationActivity } from '../../app/conversations/actions';
import { activity, liveConversation } from '../../test/conversation-activity';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { LiveUpdates } from '../live-updates/live-updates';
import {
  ConversationActivityProvider,
  useTicketLiveConversation,
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
  const live = useTicketLiveConversation(4);
  return <p>{live ? `${live.state}: ${live.line}` : 'nothing live'}</p>;
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

  it('starts with nothing live', () => {
    vi.mocked(currentConversationActivity).mockReturnValue(
      new Promise(() => {}),
    );
    show();

    expect(screen.getByText('nothing live')).toBeInTheDocument();
  });

  it('loads the activity, and loads it again when a Conversation changes', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      activity({ live: { 4: liveConversation({ line: 'Reading a.ts' }) } }),
    );
    show();
    expect(
      await screen.findByText('running: Reading a.ts'),
    ).toBeInTheDocument();

    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      activity({
        live: { 4: liveConversation({ state: 'waiting', line: 'Asks a.ts' }) },
      }),
    );
    act(() => {
      FakeEventSource.instances[0]?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'conversation', id: 1 }),
        }),
      );
    });

    await waitFor(() =>
      expect(screen.getByText('waiting: Asks a.ts')).toBeInTheDocument(),
    );
  });
});
