# In-tab notifications

Tandembike tells the User when a run needs them by a browser notification raised from an open Tandembike tab, not by Web Push.

A **Notice** (GLOSSARY) is computed by the Notices module, started with the server as Autopilot is. After each change it builds the machine-wide set of Notices from the Conversations module's public interface, diffs it by key against the previous set and publishes a `notice` change for each new key. The set at server start is the baseline and raises nothing, so a restart does not replay what already waited. A key names one occurrence: `waiting` is the Conversation and its pending entry, `needs_reply` the Conversation and its latest Run outcome. A key that persists raises nothing again; a new pending entry or a later run end is a new key. Autopilot and the other change listeners ignore `notice`, which only the browser reads.

The browser side lives in the root layout. A notifier listens on LiveUpdates' one events connection and shows `new Notification(title, { body, tag: key })` only when the User opted in in this browser, permission is `granted` and the tab is hidden or the window unfocused. A click focuses the window and navigates to the Conversation. The opt-in is a header control that asks for permission on click only, shows when the browser has blocked notifications and keeps its choice in `localStorage` behind try/catch, as the Colour mode does (ADR 0017). Without the Notification API the control is hidden.

Adding a kind is one entry in the kinds list (`src/notices/notice-kinds.ts`): a read of the current state that returns Notices with their keys. The diff, the `notice` change and the notifier stay as they are.

## Considered Options

- **Web Push** (a service worker and a push subscription): it would notify with every tab closed, but needs a service worker, VAPID keys, a stored subscription and a push service, which is a network dependency in an app that is local-only (ADR 0001, ADR 0022). A tab in the background is the normal way this app is used, and the notification works there.
- **Notify from the server when it changes state**: the server cannot tell whether the User is looking at a tab, and would raise one on a restart for each waiting run.

## Consequences

- With no Tandembike tab open there is no notification. The Conversation dialog's "needs you" count in the header is what the User sees on return.
- Two tabs of one browser raise the same `tag`, so the browser shows the notification once.
- Every change recomputes the set, which reads open Conversations and the transcripts of waiting ones; this is cheap for a local database and keeps the Notices module free of any state other than the last key set.
