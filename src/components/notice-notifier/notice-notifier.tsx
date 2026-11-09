'use client';

import { useRouter } from 'next/navigation';
import type { FC } from 'react';

import {
  notificationsSupported,
  readNotificationOptIn,
} from '../../app/lib/notifications';
import type { Notice } from '../../notices/notice';
import { useNotices } from '../live-updates/live-updates';

/** The User is not looking at Tandembike: the tab is hidden or the window unfocused. */
const awayFromTab = (): boolean => document.hidden || !document.hasFocus();

/**
 * Shows a browser notification for each Notice the server raises, only when
 * the User opted in in this browser, the browser granted permission and they
 * are not looking at the tab (ADR 0042). The key is the notification's tag,
 * so one Notice never shows twice; a click focuses the window and opens the
 * Notice's path. Renders nothing; mount it once, inside `LiveUpdates`.
 */
export const NoticeNotifier: FC = () => {
  const router = useRouter();

  useNotices((notice: Notice) => {
    if (
      !notificationsSupported() ||
      !readNotificationOptIn() ||
      Notification.permission !== 'granted' ||
      !awayFromTab()
    ) {
      return;
    }
    const notification = new Notification(notice.title, {
      body: notice.body,
      tag: notice.key,
    });
    notification.onclick = () => {
      window.focus();
      router.push(notice.path);
      notification.close();
    };
  });

  return null;
};
