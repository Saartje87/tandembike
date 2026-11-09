import { conversationOnPath, projectPath } from '../app/lib/paths';
import { isTerminal } from '../conversations/conversation-state';
import type {
  Conversations,
  OpenConversation,
} from '../conversations/conversations';
import type { Notice } from './notice';

/** What a detector reads: the Modules' public interfaces, never their tables. */
export type NoticeWorld = {
  conversations: Conversations;
};

/**
 * Finds the Notices of one kind that hold right now. The set is recomputed
 * after every change and diffed by `key`, so a detector is a pure read of the
 * current state and keeps no memory of what it raised.
 */
export type NoticeDetector = (world: NoticeWorld) => Notice[];

const subject = (open: OpenConversation): string =>
  open.conversation.ticketNumber === null
    ? open.projectName
    : `T${open.conversation.ticketNumber}`;

const conversationPath = (open: OpenConversation): string =>
  conversationOnPath(
    projectPath(open.conversation.projectId),
    open.conversation.id,
  );

/** `body` after the Ticket's title, when it has one. */
const bodyOf = (open: OpenConversation, detail?: string): string =>
  [open.ticketTitle, detail].filter((part) => part).join(': ');

const firstLine = (text: string): string => text.split('\n')[0].slice(0, 200);

/** A run waiting on a permission request or a question, keyed by that entry. */
const waiting: NoticeDetector = ({ conversations }) =>
  conversations
    .listOpen()
    .filter(
      (open) =>
        open.conversation.state === 'waiting' && !isTerminal(open.conversation),
    )
    .flatMap((open) => {
      const pending = conversations
        .transcript(open.conversation.id)
        .findLast(
          (entry) =>
            entry.permission === 'pending' ||
            (entry.question !== null &&
              entry.question.answers === null &&
              !entry.question.expired),
        );
      if (!pending) {
        return [];
      }
      return [
        {
          kind: 'waiting',
          key: `waiting:${open.conversation.id}:${pending.id}`,
          projectId: open.conversation.projectId,
          ticketNumber: open.conversation.ticketNumber,
          conversationId: open.conversation.id,
          title: `${subject(open)} is waiting for you`,
          body: bodyOf(open, firstLine(pending.text)),
          path: conversationPath(open),
        },
      ];
    });

/** The intents whose run end the User is expected to answer. */
const replyIntents = ['start', 'merge'];

/**
 * A Start or Merge run that ended needing a reply or failing on a
 * substantive error, keyed by its Run outcome. A transient end is Autopilot's
 * to resume, and the User's own stop is no news.
 */
const needsReply: NoticeDetector = ({ conversations }) =>
  conversations
    .listOpen()
    .filter(
      ({ conversation }) =>
        replyIntents.includes(conversation.intent) &&
        !isTerminal(conversation) &&
        (conversation.state === 'idle' || conversation.state === 'interrupted'),
    )
    .flatMap((open) => {
      const outcome = conversations.latestRunOutcome(open.conversation.id);
      if (outcome?.result !== 'needs_reply' && outcome?.result !== 'failed') {
        return [];
      }
      const failed = outcome.result === 'failed';
      const error = failed
        ? conversations
            .transcript(open.conversation.id)
            .findLast((entry) => entry.role === 'error')?.text
        : undefined;
      return [
        {
          kind: 'needs_reply',
          key: `needs_reply:${open.conversation.id}:${outcome.id}`,
          projectId: open.conversation.projectId,
          ticketNumber: open.conversation.ticketNumber,
          conversationId: open.conversation.id,
          title: `${subject(open)} ${failed ? 'failed' : 'needs a reply'}`,
          body: bodyOf(
            open,
            error === undefined ? undefined : firstLine(error),
          ),
          path: conversationPath(open),
        },
      ];
    });

/** Every kind's detector. A new kind adds one entry. */
export const noticeDetectors: NoticeDetector[] = [waiting, needsReply];
