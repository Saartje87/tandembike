// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationOptInStorageKey } from '../../app/lib/notifications';
import { renderWithTheme } from '../../test/render';
import { NotificationToggle } from './notification-toggle';

class FakeNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => FakeNotification.permission);
}

beforeEach(() => {
  FakeNotification.permission = 'default';
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal('Notification', FakeNotification);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const turnOn = () =>
  screen.findByRole('button', { name: 'Turn on notifications' });

describe('NotificationToggle', () => {
  it('asks for permission only on click and stores the opt-in when granted', async () => {
    renderWithTheme(<NotificationToggle />);
    const button = await turnOn();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();

    FakeNotification.requestPermission.mockImplementationOnce(async () => {
      FakeNotification.permission = 'granted';
      return 'granted';
    });
    await userEvent.click(button);

    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(notificationOptInStorageKey)).toBe('on');
    expect(
      screen.getByRole('button', { name: 'Turn off notifications' }),
    ).toBeVisible();
  });

  it('does not opt in when the User dismisses the prompt', async () => {
    renderWithTheme(<NotificationToggle />);
    await userEvent.click(await turnOn());

    expect(localStorage.getItem(notificationOptInStorageKey)).toBeNull();
    expect(await turnOn()).toBeVisible();
  });

  it('opts out on a second click without asking again', async () => {
    FakeNotification.permission = 'granted';
    localStorage.setItem(notificationOptInStorageKey, 'on');
    renderWithTheme(<NotificationToggle />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Turn off notifications' }),
    );

    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(localStorage.getItem(notificationOptInStorageKey)).toBeNull();
    expect(await turnOn()).toBeVisible();
  });

  it('opts in without asking when permission was granted before', async () => {
    FakeNotification.permission = 'granted';
    renderWithTheme(<NotificationToggle />);

    await userEvent.click(await turnOn());

    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(localStorage.getItem(notificationOptInStorageKey)).toBe('on');
  });

  it('shows that the browser blocked notifications', async () => {
    FakeNotification.permission = 'denied';
    localStorage.setItem(notificationOptInStorageKey, 'on');
    renderWithTheme(<NotificationToggle />);

    const button = await screen.findByRole('button', {
      name: 'Notifications are blocked in this browser',
    });
    expect(button).toBeDisabled();
  });

  it('is hidden without the Notification API', () => {
    vi.stubGlobal('Notification', undefined);
    renderWithTheme(<NotificationToggle />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('survives storage errors', async () => {
    FakeNotification.permission = 'granted';
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderWithTheme(<NotificationToggle />);

    await userEvent.click(await turnOn());

    expect(await turnOn()).toBeVisible();
  });
});
