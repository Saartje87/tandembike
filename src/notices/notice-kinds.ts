import {
  boardPathOf,
  conversationOnPath,
  projectPath,
  settingsPath,
  ticketOnBoardPath,
} from '../app/lib/paths';
import { formatCost } from '../components/conversation-labels/conversation-labels';
import { conversationActivity } from '../conversations/conversation-activity';
import { isTerminal } from '../conversations/conversation-state';
import type {
  Conversations,
  OpenConversation,
} from '../conversations/conversations';
import { isPullRequestReference } from '../tickets/external-reference-display';
import { inheritsSection, isStalled, laneOf } from '../tickets/ticket-lanes';
import type { Ticket, Tickets } from '../tickets/tickets';
import type { Notice } from './notice';

/** What a detector reads: the Modules' public interfaces, never their tables. */
export type NoticeWorld = {
  conversations: Conversations;
  tickets: Tickets;
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

/** The Ticket's drawer over the Board it shows on (ADR 0013). */
const ticketPath = (ticket: Ticket): string => {
  const cycle = ticket.cycle;
  const open = cycle?.state === 'Prepared' || cycle?.state === 'Active';
  return ticketOnBoardPath(
    boardPathOf(ticket.projectId, open ? cycle.id : null),
    ticket.number,
  );
};

const ticketNotice = (
  ticket: Ticket,
  fields: Pick<Notice, 'kind' | 'key' | 'title' | 'body'>,
): Notice => ({
  ...fields,
  projectId: ticket.projectId,
  ticketNumber: ticket.number,
  conversationId: null,
  path: ticketPath(ticket),
});

/** The In progress Tickets, each with what the Board's Lane derivation needs. */
function inProgress({ tickets, conversations }: NoticeWorld) {
  const { live } = conversationActivity(conversations.activityRows());
  return tickets.listTickets({ status: 'In progress' }).map((ticket) => ({
    ticket,
    own: live[ticket.number],
    epicLive: ticket.epic ? live[ticket.epic.number] : undefined,
  }));
}

/**
 * A Ticket or Epic at the Merge gate: in Review by its own PR reference,
 * keyed by that PR so a new PR raises it again. A child in Review by its
 * Epic's PR is the Epic's to merge.
 */
const merge: NoticeDetector = (world) =>
  inProgress(world).flatMap(({ ticket, own, epicLive }) => {
    const pullRequest = ticket.externalReferences.findLast(
      isPullRequestReference,
    );
    if (
      pullRequest === undefined ||
      laneOf(ticket, own, epicLive).section !== 'Review' ||
      inheritsSection(ticket, own)
    ) {
      return [];
    }
    return [
      ticketNotice(ticket, {
        kind: 'merge',
        key: `merge:${ticket.number}:${pullRequest}`,
        title: `T${ticket.number} is ready to merge`,
        body: ticket.title,
      }),
    ];
  });

/** The changes after which a Ticket may have become Stalled. */
const stallingChanges = new Set([
  'status',
  'claimReleased',
  'claimCleared',
  'externalReferenceRemoved',
]);

/**
 * When `ticket` became Stalled: the latest of its own (and for a child
 * placed by its Epic, the Epic's) Activity that can cause it, and the
 * latest change of its Conversations, such as the User closing one.
 */
function stalledSince(
  { tickets, conversations }: NoticeWorld,
  ticket: Ticket,
): number {
  const numbers = [ticket.number, ...(ticket.epic ? [ticket.epic.number] : [])];
  const times = [
    ticket.createdAt.getTime(),
    ...numbers.flatMap((number) =>
      tickets
        .listActivity(number)
        .filter(({ changes }) =>
          changes.some(({ type }) => stallingChanges.has(type)),
        )
        .map(({ createdAt }) => createdAt.getTime()),
    ),
    ...numbers.flatMap((number) =>
      conversations
        .list({ ticketNumber: number })
        .map(({ updatedAt }) => updatedAt.getTime()),
    ),
  ];
  return Math.max(...times);
}

/** A Ticket or Epic that is Stalled by the Board's derivation, keyed by since when. */
const stalled: NoticeDetector = (world) =>
  inProgress(world)
    .filter(({ ticket, own, epicLive }) => isStalled(ticket, own, epicLive))
    .map(({ ticket }) =>
      ticketNotice(ticket, {
        kind: 'stalled',
        key: `stalled:${ticket.number}:${stalledSince(world, ticket)}`,
        title: `T${ticket.number} is stalled`,
        body: ticket.title,
      }),
    );

/** A Ticket with a pending triage proposal, keyed by the proposal. */
const triage: NoticeDetector = ({ tickets }) =>
  tickets.listProjects().flatMap((project) =>
    tickets.pendingTriageNumbers(project.id).flatMap((number) => {
      const proposal = tickets.pendingTriage(number);
      const ticket = tickets.getTicket(number);
      if (!proposal || ticket.archived) {
        return [];
      }
      return [
        ticketNotice(ticket, {
          kind: 'triage',
          key: `triage:${proposal.id}`,
          title: `T${number} has a triage proposal`,
          body: `${ticket.title}: ${proposal.category}, ${proposal.state}`,
        }),
      ];
    }),
  );

/** The local calendar day of `now`, as the ceilings' days reset at midnight. */
const dayOf = (now: Date): string =>
  [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');

/**
 * Autopilot paused on a ceiling: a Project's Spend ceiling on its Active
 * Cycle, a Project's triage ceiling or the machine ceiling. Keyed by the
 * ceiling, its Project or Cycle and the day, so each pause notifies once a day.
 */
const ceiling: NoticeDetector = ({ tickets, conversations }) => {
  const day = dayOf(new Date());
  const found: Notice[] = [];
  const machine = conversations.machineBudget();
  if (machine?.paused) {
    found.push({
      kind: 'ceiling',
      key: `ceiling:machine:${day}`,
      projectId: null,
      ticketNumber: null,
      conversationId: null,
      title: 'Autopilot paused on the machine ceiling',
      body: `${formatCost(machine.spendUsd)} spent today of ${formatCost(machine.ceilingUsd)}`,
      path: settingsPath(),
    });
  }
  for (const project of tickets.listProjects()) {
    if (project.archived) {
      continue;
    }
    const settings = tickets.getProjectAgentSettings(project.id);
    const cycle = tickets
      .listCycles(project.id)
      .find((candidate) => candidate.state === 'Active');
    if (settings.autopilot && cycle && settings.spendCeilingUsd !== null) {
      const spendUsd = conversations.autopilotSpend({
        projectId: project.id,
        cycleId: cycle.id,
      });
      if (spendUsd >= settings.spendCeilingUsd) {
        found.push({
          kind: 'ceiling',
          key: `ceiling:spend:${cycle.id}:${day}`,
          projectId: project.id,
          ticketNumber: null,
          conversationId: null,
          title: `Autopilot paused on ${project.name}'s Spend ceiling`,
          body: `${formatCost(spendUsd)} spent of ${formatCost(settings.spendCeilingUsd)} on ${cycle.title}`,
          path: projectPath(project.id),
        });
      }
    }
    const triageBudget = conversations.triageBudget(project.id);
    if (triageBudget?.paused) {
      found.push({
        kind: 'ceiling',
        key: `ceiling:triage:${project.id}:${day}`,
        projectId: project.id,
        ticketNumber: null,
        conversationId: null,
        title: `Auto-triage paused on ${project.name}'s triage ceiling`,
        body: `${formatCost(triageBudget.spendUsd)} spent today of ${formatCost(triageBudget.ceilingUsd)}`,
        path: projectPath(project.id),
      });
    }
  }
  return found;
};

/** Every kind's detector. A new kind adds one entry. */
export const noticeDetectors: NoticeDetector[] = [
  waiting,
  needsReply,
  merge,
  stalled,
  triage,
  ceiling,
];
