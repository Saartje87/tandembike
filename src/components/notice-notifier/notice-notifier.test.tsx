// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationOptInStorageKey } from '../../app/lib/notifications';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import type { Change } from '../../tickets/changes';
import { LiveUpdates } from '../live-updates/live-updates';
import { NoticeNotifier } from './notice-notifier';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

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
}

class FakeNotification {
  static instances: FakeNotification[] = [];
  static permission: NotificationPermission = 'granted';
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(
    readonly title: string,
    readonly options: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
}

const notice: Change = {
  type: 'notice',
  notice: {
    kind: 'waiting',
    key: 'waiting:7:12',
    projectId: 3,
    ticketNumber: 42,
    conversationId: 7,
    title: 'T42 is waiting for you',
    body: 'Fix the footer: Bash',
    path: '/project/3?conversation=7',
  },
};

let router: ReturnType<typeof useRouter>;
let hidden: boolean;
let focused: boolean;

const mount = () =>
  renderWithTheme(
    <LiveUpdates>
      <NoticeNotifier />
    </LiveUpdates>,
  );
const raise = () => FakeEventSource.instances[0].announce(notice);

beforeEach(() => {
  FakeEventSource.instances = [];
  FakeNotification.instances = [];
  FakeNotification.permission = 'granted';
  hidden = true;
  focused = false;
  router = mockRouter();
  vi.mocked(useRouter).mockReturnValue(router);
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('Notification', FakeNotification);
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  localStorage.setItem(notificationOptInStorageKey, 'on');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('NoticeNotifier', () => {
  it('shows a notification with the key as tag when opted in, granted and the tab is hidden', () => {
    mount();
    raise();

    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].title).toBe('T42 is waiting for you');
    expect(FakeNotification.instances[0].options).toEqual({
      body: 'Fix the footer: Bash',
      tag: 'waiting:7:12',
    });
  });

  it('shows one when the tab is visible but the window is unfocused', () => {
    hidden = false;
    mount();
    raise();

    expect(FakeNotification.instances).toHaveLength(1);
  });

  it('shows none while the User is looking at the tab', () => {
    hidden = false;
    focused = true;
    mount();
    raise();

    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('shows none without the opt-in', () => {
    localStorage.clear();
    mount();
    raise();

    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('shows none unless permission is granted', () => {
    FakeNotification.permission = 'default';
    mount();
    raise();

    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('shows none when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mount();
    raise();

    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('does not refresh the page for a notice', () => {
    mount();
    raise();

    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('focuses the window and opens the path on click', () => {
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    mount();
    raise();

    FakeNotification.instances[0].onclick?.();

    expect(focus).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/project/3?conversation=7');
    expect(FakeNotification.instances[0].close).toHaveBeenCalled();
  });
});
