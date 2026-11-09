'use client';

import { IconButton } from '@blockle/blocks';
import { type FC, useEffect, useState } from 'react';

import {
  notificationsSupported,
  readNotificationOptIn,
  writeNotificationOptIn,
} from '../../app/lib/notifications';
import { Icon } from '../icon/icon';

type State = { optedIn: boolean; permission: NotificationPermission };

const readState = (): State => ({
  optedIn: readNotificationOptIn(),
  permission: Notification.permission,
});

/**
 * The header control for browser notifications (ADR 0042). A click opts in
 * and asks the browser for permission, the only place that asks; a second
 * click opts out. When the browser has blocked notifications it says so and
 * does nothing. Hidden without the Notification API, and until the browser's
 * state is read, so the server render matches the first client render.
 */
export const NotificationToggle: FC = () => {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (notificationsSupported()) {
      setState(readState());
    }
  }, []);

  if (state === null) {
    return null;
  }

  const blocked = state.permission === 'denied';
  const on = state.optedIn && state.permission === 'granted';

  const toggle = async () => {
    if (on) {
      writeNotificationOptIn(false);
    } else {
      const permission =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission;
      writeNotificationOptIn(permission === 'granted');
    }
    setState(readState());
  };

  const label = blocked
    ? 'Notifications are blocked in this browser'
    : on
      ? 'Turn off notifications'
      : 'Turn on notifications';

  return (
    <IconButton
      type="button"
      size="small"
      variant="ghost"
      intent="inherit"
      label={label}
      aria-pressed={on}
      disabled={blocked}
      onClick={toggle}
    >
      <Icon name={on ? 'bell' : 'bell-slash'} color="white" />
    </IconButton>
  );
};
