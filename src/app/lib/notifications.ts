/** Where this browser keeps whether the User opted in to browser notifications. */
export const notificationOptInStorageKey = 'tandembike:notifications';

/** Whether this browser has the Notification API. */
export const notificationsSupported = (): boolean =>
  typeof Notification !== 'undefined';

/** Whether the User opted in in this browser; false when storage cannot be read. */
export function readNotificationOptIn(): boolean {
  try {
    return localStorage.getItem(notificationOptInStorageKey) === 'on';
  } catch {
    return false;
  }
}

/** Stores the choice; when storage fails the choice is lost, as without storage. */
export function writeNotificationOptIn(optedIn: boolean) {
  try {
    if (optedIn) {
      localStorage.setItem(notificationOptInStorageKey, 'on');
    } else {
      localStorage.removeItem(notificationOptInStorageKey);
    }
  } catch {
    // Storage is full or blocked.
  }
}
