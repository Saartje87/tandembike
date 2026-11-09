import type { ChangeChannel } from '../tickets/changes';
import type { Notice } from './notice';
import { type NoticeWorld, noticeDetectors } from './notice-kinds';

export type NoticesDeps = Omit<NoticeWorld, 'now'> & {
  changes: ChangeChannel;
  now?: () => Date;
};

/**
 * Notices (ADR 0042): after every change it computes the machine-wide set of
 * Notices and publishes a `notice` change for each key the previous set did
 * not have. The set when `start` is called is the baseline and raises
 * nothing. It only reads; it never writes a Ticket or a Conversation.
 */
export function createNotices({
  conversations,
  tickets,
  changes,
  now = () => new Date(),
}: NoticesDeps) {
  const world: NoticeWorld = { conversations, tickets, now };

  const compute = (): Notice[] =>
    noticeDetectors.flatMap((detect) => detect(world));

  return {
    /** Takes the baseline and listens for changes. Returns a function that stops. */
    start(): () => void {
      let seen = new Set(compute().map((notice) => notice.key));
      return changes.subscribe((change) => {
        // Its own output, and nothing else's business.
        if (change.type === 'notice') {
          return;
        }
        try {
          const current = compute();
          const fresh = current.filter((notice) => !seen.has(notice.key));
          seen = new Set(current.map((notice) => notice.key));
          for (const notice of fresh) {
            changes.publish({ type: 'notice', notice });
          }
        } catch (error) {
          console.error('Notices could not be computed', error);
        }
      });
    },
  };
}

export type Notices = ReturnType<typeof createNotices>;
