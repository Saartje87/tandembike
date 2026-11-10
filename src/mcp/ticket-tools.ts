import { z } from 'zod';

import { TicketsError } from '../tickets/errors';
import { paletteColors } from '../tickets/palette';
import { checkBatchNumbers, maxBatchSize } from '../tickets/rules';
import { ticketTypes } from '../tickets/ticket-type';
import {
  defaultPageSize,
  maxAcceptanceCriteria,
  maxPageSize,
  type Ticket,
  type Tickets,
  ticketDetails,
  ticketSorts,
  ticketSummary,
  type UpdateTicketInput,
} from '../tickets/tickets';
import {
  addExternalReferences,
  addLabels,
  batchTicketNumbers,
  criterionId,
  cycleId,
  detail,
  epicColor,
  externalReference,
  hasProject,
  label,
  newCriterion,
  newTicketFields,
  originNumber,
  projectId,
  removeExternalReferences,
  removeLabels,
  respond,
  respondBatch,
  returnsSummary,
  status,
  type ToolContext,
  ticketNumber,
  withChildren,
  withMoveHint,
  withoutDescription,
  withPlaceholderNote,
} from './tool-shared';

type TicketUpdate = Omit<UpdateTicketInput, 'projectId'> & {
  projectId?: number;
  epicNumber?: number | null;
  addBlockers?: number[];
  removeBlockers?: number[];
  cycleId?: number | null;
  withChildren?: boolean;
  archived?: boolean;
  before?: number;
  after?: number;
};

/**
 * One Ticket's update_ticket change: the Ticket after it, and with
 * `withChildren` the children whose Cycle changed with it.
 */
type TicketUpdateResult = { ticket: Ticket; childrenMoved?: number[] };

/**
 * One Ticket's update_ticket change: a restore first, so the rest applies
 * to the restored Ticket, then the core fields, Epic, Blockers, Cycle, Board
 * position and archive, in that order, all in one transaction. Each
 * step is refused with the message of the single-purpose rule it applies, and
 * a refusal leaves the Ticket unchanged.
 */
const applyTicketUpdate = (
  tickets: Tickets,
  number: number,
  {
    epicNumber,
    addBlockers = [],
    removeBlockers = [],
    cycleId,
    withChildren,
    archived,
    before,
    after,
    ...core
  }: TicketUpdate,
): TicketUpdateResult =>
  tickets.transaction(() => {
    if (withChildren && cycleId === undefined) {
      throw new TicketsError(
        "withChildren takes an Epic's children along to a Cycle, so give cycleId with it.",
      );
    }
    if (before !== undefined && after !== undefined) {
      throw new TicketsError(
        'Give either before or after: a Ticket lands next to one Ticket.',
      );
    }
    let childrenMoved: number[] | undefined;
    const hasCore = Object.values(core).some((value) => value !== undefined);
    const hasSteps =
      epicNumber !== undefined ||
      addBlockers.length > 0 ||
      removeBlockers.length > 0 ||
      cycleId !== undefined ||
      before !== undefined ||
      after !== undefined ||
      archived !== undefined;
    // An archived Ticket is read-only, so restore it before the rest.
    if (archived === false) {
      tickets.restoreTicket(number);
    }
    // With nothing to change, updateTicket gives its own refusal.
    if (hasCore || !hasSteps) {
      tickets.updateTicket(number, core);
    }
    if (epicNumber === null) {
      tickets.detachFromEpic(number);
    } else if (epicNumber !== undefined) {
      tickets.moveToEpic({ epic: epicNumber, child: number });
    }
    for (const blocker of addBlockers) {
      tickets.addBlocker({ blocker, blocked: number });
    }
    for (const blocker of removeBlockers) {
      tickets.removeBlocker({ blocker, blocked: number });
    }
    if (cycleId !== undefined) {
      const moved = tickets.moveTicketsToCycle({
        cycleId,
        ticketNumbers: [number],
        withChildren,
      });
      if (moved.failed.length > 0) {
        throw new TicketsError(withMoveHint(moved.failed[0].error));
      }
      childrenMoved = moved.children;
    }
    if (before !== undefined) {
      tickets.reorderTicket(number, { before });
    } else if (after !== undefined) {
      tickets.reorderTicket(number, { after });
    }
    if (archived === true) {
      tickets.archiveTicket(number);
    }
    const ticket = tickets.getTicket(number);
    return childrenMoved ? { ticket, childrenMoved } : { ticket };
  });

export const registerTicketTools = ({
  tickets,
  cwd,
  runId,
  resolveProjectId,
  registerTool,
}: ToolContext): void => {
  registerTool(
    'find_tickets',
    {
      title: 'Find Tickets',
      description: `Find Tickets, oldest-created first or in Board order (sort), optionally only those in one Project (by projectId or projectName), in one or more Statuses, only Tickets or only Epics (type: "Epic" lists a Project's Epics without detail: "full"), only the children of one Epic (epicNumber lists an Epic's children with their Statuses and blocked flags, without get_ticket's description), with given labels, with any of given External references, split from one Origin, containing a search query and/or created or changed since a time (changedSince). Returns { tickets, nextCursor, total }: a page of at most limit Tickets, the cursor for the next page, or null on the last page, and total, how many Tickets match the filters over all pages, whatever the cursor. An empty tickets list means nothing matched. By default each Ticket is a summary: its number, title, status, type (Ticket or Epic), labels, blocked (whether any Blocker is unresolved), epicNumber (the Epic it is a child of, the same number the epicNumber filter takes, or null) and updatedAt, plus projectId when the list is not for one Project. With detail: "full", each is the whole Ticket: also its description, type, color, epic, blockedBy, claim, External references, acceptance criteria, children, Board position, archived flag and timestamps, as get_ticket returns it. Add description: false to leave each description out and keep everything else, which is much shorter when you need a Project's structure, labels or criteria.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe('Only list Tickets in this Project (id from get_project).'),
        projectName: z
          .string()
          .optional()
          .describe(
            'Only list Tickets in the Project with this name, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
        status: z
          .union([status, z.array(status)])
          .optional()
          .describe(
            'Only list Tickets in this Status, or with a list such as ["Todo", "In progress"], in any of those Statuses.',
          ),
        type: z
          .enum(ticketTypes)
          .optional()
          .describe(
            'Only list Tickets of this type: "Epic" lists only Epics, "Ticket" only normal Tickets. Use type: "Epic" to find a Project\'s Epics without detail: "full".',
          ),
        epicNumber: ticketNumber
          .optional()
          .describe(
            'Only list the children of this Epic. Combines with the other filters, such as status, blocked, claimed and labels. Use it to see an Epic\'s children, Statuses and blocked flags without reading the Epic with get_ticket. With detail: "full" and description: false it returns every child\'s acceptance criteria in one call, such as to see which are unchecked before finishing the Epic.',
          ),
        labels: z
          .array(label)
          .optional()
          .describe(
            'Only list Tickets that have every one of these labels, ignoring case.',
          ),
        allProjects: z
          .boolean()
          .optional()
          .describe(
            `List Tickets of every Project. Without a Project, projectName or projectId, find_tickets lists the Project of your working folder when one contains it; true lists every Project's instead.`,
          ),
        includeArchived: z
          .boolean()
          .optional()
          .describe(
            'Also list archived Tickets, and Tickets of archived Projects. Defaults to false. Naming an archived Project by projectId or projectName lists its Tickets without this.',
          ),
        blocked: z
          .boolean()
          .optional()
          .describe(
            'true lists only Tickets with an unresolved Blocker; false lists only Tickets with none, ready to start once their Status allows.',
          ),
        claimed: z
          .boolean()
          .optional()
          .describe(
            "true lists only claimed Tickets; false lists only unclaimed Tickets. A claimed Epic's children count as claimed, since its Claim covers them.",
          ),
        query: z
          .string()
          .optional()
          .describe(
            'Only list Tickets whose title or description contains this text, trimmed and ignoring case (for ASCII letters only). % and _ match literally.',
          ),
        externalReferences: z
          .array(externalReference)
          .optional()
          .describe(
            'Only list Tickets that have any of these External references, unlike labels, which needs every one. Each is trimmed and matched exactly, never partly: ABC-3 does not match ABC-33, and a GitHub issue number after a hash does not match the URL of that issue. Use it to check whether a Ticket for an item in another system already exists; pass includeArchived: true when checking for duplicates, since the earlier Ticket may be archived. An empty list is refused.',
          ),
        limit: z
          .number()
          .int()
          .optional()
          .describe(
            `List at most this many Tickets, from 1 to ${maxPageSize}. Defaults to ${defaultPageSize}.`,
          ),
        cursor: ticketNumber
          .optional()
          .describe(
            'Continue after this Ticket number: the nextCursor of the previous page, with the same filters.',
          ),
        detail: z
          .enum(ticketDetails)
          .optional()
          .describe(
            'How much of each Ticket to list. "summary", the default: number, title, status, type, labels, blocked, epicNumber and updatedAt, plus projectId unless the list is for one Project. "full": the whole Ticket, as get_ticket returns it.',
          ),
        description: z
          .boolean()
          .optional()
          .describe(
            'With detail: "full", whether to include each Markdown description. Defaults to true; false leaves it out and returns everything else unchanged. A summary has no description, so it ignores this.',
          ),
        sort: z
          .enum(ticketSorts)
          .optional()
          .describe(
            `The order to list Tickets in. "created", the default: oldest-created first. "position": Board order, the order the User ranks Tickets in: a Status's Board order for Todo, In progress and Done in turn, each top to bottom (a Board Lane, such as Todo, shows that order filtered by labels); it needs projectId or projectName. Paging in Board order can skip or repeat a Ticket that moves on the Board between calls.`,
          ),
        originNumber: originNumber
          .optional()
          .describe(
            'Only list the Tickets split from this Ticket: those whose Origin it is.',
          ),
        cycleId: cycleId
          .nullable()
          .optional()
          .describe(
            'Only list the Tickets planned into this Cycle, or with null, the Backlog: those in no Prepared or Active Cycle, except the Done Tickets of an Archived Cycle, which stay with it.',
          ),
        changedSince: z
          .string()
          .optional()
          .describe(
            'Only list Tickets created or changed at or after this ISO 8601 timestamp with a time zone, such as 2026-11-07T23:05:00Z. Planning a Ticket into, out of or between Cycles counts as a change; rolling a Cycle over or archiving it does not. An Epic also counts as changed when one of its children was created, attached, detached or changed since. Use it to check what other sessions changed before publishing work, such as find_tickets({ projectName, cycleId, type: "Epic", changedSince }) with the time you started.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    ({ description, allProjects, ...rest }) =>
      respond(() => {
        const folderProjectId =
          allProjects || cwd === undefined || hasProject(rest)
            ? undefined
            : tickets.findProjectIdOfFolder(cwd);
        const input =
          folderProjectId === undefined
            ? rest
            : { ...rest, projectId: folderProjectId };
        const page = tickets.findTickets(input);
        return input.detail === 'full' && description === false
          ? {
              ...page,
              tickets: (page.tickets as Ticket[]).map(withoutDescription),
            }
          : page;
      }),
  );

  registerTool(
    'get_ticket',
    {
      title: 'Get Ticket',
      description:
        'Get one Ticket by its number, including the full Markdown description, its comments (oldest first, each with id, author, body, createdAt, editedAt) and its acceptanceCriteria (each with id, text and checked, in order). Its type is Ticket or Epic, and color is the colour of an Epic, or null for a normal Ticket; epic is the Epic it is a child of ({ number, title, color }) or null, and an Epic lists its children, each with number, title, Status, archived, blockedBy, blocked and uncheckedCriteria (how many of its acceptance criteria are not checked). origin is the Ticket it was split from ({ number, title, status }) or null, and splitOff lists the Tickets split from it, each with number, title, status and archived. cycle is the Cycle whose Board it shows on ({ id, title, state }): the Prepared or Active Cycle it is planned into, else for a Done Ticket the most recently archived Cycle that kept it, else null for the Backlog. externalReferences lists the URLs and keys of the same work in other systems, in the order they were added. attachments lists its files (id, name, mediaType, size, author, createdAt; never the content), in the order added; read one with read_attachment. include: ["activity"] adds its Activity, oldest first: one entry per action that changed it, each with id, actor, createdAt and changes. Read it before starting work on the Ticket. Pass description: false to leave the description out and get everything else, which is much shorter when you only need an Epic\'s children with their Statuses and Blockers, or a Ticket\'s labels, claim or criteria.',
      inputSchema: {
        number: ticketNumber,
        description: z
          .boolean()
          .optional()
          .describe(
            'Whether to include the Markdown description. Defaults to true; false leaves it out and returns everything else unchanged.',
          ),
        include: z
          .array(z.enum(['activity']))
          .optional()
          .describe(
            'Extra parts to include. "activity" adds the Ticket\'s Activity as activity.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    ({ number, description, include }) =>
      respond(() => {
        const ticket = tickets.getTicket(number);
        const whole = {
          ...(description === false ? withoutDescription(ticket) : ticket),
          comments: tickets.listComments(number),
          ...(include?.includes('activity')
            ? {
                activity: tickets
                  .listActivity(number)
                  .map(({ id, actor, createdAt, changes }) => ({
                    id,
                    actor,
                    createdAt,
                    changes,
                  })),
              }
            : {}),
        };
        return whole;
      }),
  );
  registerTool(
    'file_tickets',
    {
      title: 'File Tickets',
      description: `Create from 1 to ${maxBatchSize} Tickets in one Project, given by projectId or projectName, optionally planned into a Cycle, in one call, in order, with the Blockers between them given by position, and Blockers among existing Tickets given by number (blockedByNumbers), instead of one call each. To refer to another Ticket of the batch in a title, description or acceptance criterion, write {{T:n}}, n being its position counted from 0: it is replaced by that Ticket's number, such as T42, in the same call, wherever it stands in the text (code included), and may name a later Ticket or the Ticket itself. A position outside the batch refuses it. Do not guess numbers; they are shared by all Projects. Length limits apply after the replacement. All or nothing: if any Ticket breaks a rule, none is created and the error names it by position. A Ticket may also be an Epic (type "Epic", with an optional color) and the Tickets after it may be its children (epicPosition), or be split from an earlier one (originPosition); any Ticket may instead be split from an existing Ticket (its own originNumber), so an Epic, its Origin and its children, or a spec and its Tickets, are created atomically. A feedback Ticket is one labelled from:agent-run or from:tandembike: a run may file at most 3 of them in total (a batch that would exceed it is refused whole; add a note to an earlier one with add_note instead), and one whose title nearly repeats (word overlap of 0.75 or more) a feedback Ticket in the Project that is neither Done nor archived is refused, naming it. Other Tickets are never capped or checked. Returns { numbers }: the new Ticket numbers, in the order given.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'The Project the Tickets belong to (id from get_project). Give this or projectName.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'The name of the Project the Tickets belong to, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
        epicNumber: ticketNumber
          .optional()
          .describe(
            'Create every Ticket as a child of this Epic, which must be in the same Project.',
          ),
        originNumber: originNumber
          .optional()
          .describe(
            'The Ticket they were all split from, such as the spec they came out of, in any Project.',
          ),
        cycleId: cycleId
          .optional()
          .describe(
            'Plan every Ticket into this Cycle, by the rules of the cycleId field of update_ticket: it must be Prepared or Active and in the same Project. A refused Cycle creates none.',
          ),
        tickets: z
          .array(
            z.strictObject({
              ...newTicketFields,
              title: withPlaceholderNote(newTicketFields.title),
              description: withPlaceholderNote(newTicketFields.description),
              acceptanceCriteria: withPlaceholderNote(
                newTicketFields.acceptanceCriteria,
              ),
              type: z
                .enum(ticketTypes)
                .optional()
                .describe(
                  "Ticket, the default, or Epic: a Ticket that groups child Tickets. Name an Epic of this list by epicPosition to create Tickets under it. An Epic's Status follows its children, so give it none; an Epic cannot have epicPosition or the batch epicNumber.",
                ),
              color: epicColor
                .optional()
                .describe(
                  `For an Epic: its colour, one of ${paletteColors.join(', ')}. Left out, it gets the colour fewest live Epics in the Project use. Only an Epic has a colour.`,
                ),
              epicPosition: z
                .number()
                .int()
                .optional()
                .describe(
                  'The position, counted from 0, of an earlier Ticket in this list created with type "Epic", to create this Ticket under. Not together with the batch epicNumber.',
                ),
              originPosition: z
                .number()
                .int()
                .optional()
                .describe(
                  'The position, counted from 0, of an earlier Ticket in this list that this one was split from. Not together with the batch originNumber.',
                ),
              originNumber: originNumber
                .optional()
                .describe(
                  'An existing Ticket, in any Project, that this one was split from, such as the idea an Epic came out of. Not together with originPosition or the batch originNumber; a missing Ticket refuses the batch.',
                ),
              blockedByPositions: z
                .array(z.number().int())
                .optional()
                .describe(
                  'The positions, counted from 0, of earlier Tickets in this list that block this one. Only earlier positions can be named, so list the Tickets in dependency order.',
                ),
              blockedByNumbers: z
                .array(ticketNumber)
                .optional()
                .describe(
                  "Existing Tickets, in any Project, that block this one, by the rules of update_ticket's addBlockers: no Epic blocking its own child. A missing Ticket or a broken rule refuses the batch, naming this Ticket by position.",
                ),
            }),
          )
          .describe(
            `The Tickets to create, in order, from 1 to ${maxBatchSize}.`,
          ),
      },
    },
    ({ projectId, projectName, ...input }) =>
      respond(() => ({
        numbers: tickets
          .createTicketBatch({
            ...input,
            projectId: resolveProjectId({ projectId, projectName }),
            filedByRun: runId,
          })
          .map(({ number }) => number),
      })),
  );

  registerTool(
    'update_ticket',
    {
      title: 'Update Ticket',
      description: `Change any subset of a Ticket's title, description, Status, an Epic's color, Project (by projectId or projectName), Origin, labels, External references, acceptance criteria, Epic (epicNumber attaches, or moves it from another Epic; null detaches), Blockers (addBlockers, removeBlockers), Cycle (cycleId plans or moves it, null unplans it to the Backlog; withChildren takes an Epic's children along), Board position (before or after another Ticket of its Project and Status) and archived (true archives, false restores). Fields left out stay as they are. An archived Ticket refuses every change until it is restored, so archived: false restores it first; then the core fields change, then the Epic, Blockers, Cycle, Board position and archived: true steps in that order, all or nothing: a refusal leaves that Ticket unchanged. Give number as a list of up to ${maxBatchSize} numbers to apply the same change to each: each Ticket's change is as above, the batch is not atomic, and the result is { updated, failed } with the number and error of each Ticket left unchanged, an error when any failed. Use it to swap a triage state label with removeLabels and addLabels together. To finish a Ticket or an Epic, with a PR or without, use finish_work, which applies the whole completion rule and checks the acceptance criteria; setting Done here is for the User's own edits and leaves the labels as they are. ${returnsSummary({ extra: 'blockedBy, epicNumber or archived when the call changes them' })}`,
      inputSchema: {
        number: z
          .union([ticketNumber, batchTicketNumbers])
          .describe(
            'The Ticket, e.g. 42 for T42, or a list of Ticket numbers to apply the same change to.',
          ),
        title: z
          .string()
          .optional()
          .describe('A new one-line title, at most 200 characters.'),
        description: z
          .string()
          .optional()
          .describe(
            'A new Markdown description, at most 50,000 characters. Replaces the whole description.',
          ),
        status: status
          .optional()
          .describe(
            "The new Status. An Epic's follows its children and cannot be set.",
          ),
        color: epicColor
          .optional()
          .describe(
            `An Epic's new colour, one of ${paletteColors.join(', ')}. Only an Epic has a colour.`,
          ),
        projectId: projectId
          .optional()
          .describe(
            'Move the Ticket to this Project (id from get_project). A child, or an Epic with children, cannot move.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'Move the Ticket to the Project with this name, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
        originNumber: originNumber
          .nullable()
          .optional()
          .describe(
            'The Ticket it was split from, in any Project, or null to clear it. A Ticket cannot be its own Origin, and an Origin chain cannot loop.',
          ),
        addLabels,
        removeLabels,
        addExternalReferences,
        removeExternalReferences,
        epicNumber: ticketNumber
          .nullable()
          .optional()
          .describe(
            'Make the Ticket a child of this Epic, in the same Project (a Ticket in another Epic moves straight to this one), or with null take it out of its Epic.',
          ),
        addBlockers: z
          .array(ticketNumber)
          .optional()
          .describe(
            'Numbers of Tickets that must be resolved (Done or archived) before this one can start. A Ticket cannot block itself, a Blocker that makes a cycle is refused, and Blockers between an Epic and its own children are refused.',
          ),
        removeBlockers: z
          .array(ticketNumber)
          .optional()
          .describe(
            'Numbers of Tickets to stop blocking this one; ones that do not block it are ignored.',
          ),
        cycleId: cycleId
          .nullable()
          .optional()
          .describe(
            'Plan the Ticket into this Prepared or Active Cycle of its Project, moving it out of the Cycle it is in, or with null take it out of its Cycle, back to the Backlog.',
          ),
        withChildren: withChildren.describe(
          "With cycleId, take an Epic's unarchived children along, Done ones included: into a Cycle, every child joins it, leaving any other Cycle that is not Archived; with null, the children in the Epic's Cycle return to the Backlog with it. The result's childrenMoved names the children it moved. Refused on a Ticket that is not an Epic, and without cycleId. Defaults to false: only the Ticket moves.",
        ),
        before: ticketNumber
          .optional()
          .describe(
            "Move the Ticket on the Board directly before this Ticket, which must be in the same Project and Status (after any status change in this call), by the same rule as the User's drag. The other Tickets keep their order; find_tickets sort position lists the new order. Recorded in Activity. One Ticket at a time, and not with after.",
          ),
        after: ticketNumber
          .optional()
          .describe(
            'Move the Ticket on the Board directly after this Ticket, as before does. Not with before.',
          ),
        archived: z
          .boolean()
          .optional()
          .describe(
            'true archives the Ticket: it leaves the Board and find_tickets (unless includeArchived is set) but keeps everything; false restores it. Restoring an Epic also brings back the children archived with it. An Epic cannot be archived while any child is not archived. Agents cannot delete Tickets; the User can, from the app.',
          ),
        acceptanceCriteria: z
          .array(
            newCriterion.extend({
              id: criterionId
                .optional()
                .describe(
                  'Keep this existing criterion (id from get_ticket); leave it out for a new one.',
                ),
              checked: newCriterion.shape.checked.describe(
                'Whether it is met. Left out, a kept criterion keeps its state unless its text changes, which unchecks it; a new one starts unchecked.',
              ),
            }),
          )
          .optional()
          .describe(
            `The Ticket's whole new list of acceptance criteria, in order, at most ${maxAcceptanceCriteria}. Criteria left out are removed; an empty list removes them all. To only check or uncheck criteria, use check_criterion.`,
          ),
        detail,
      },
    },
    ({ number, detail, projectName, projectId, ...changes }) => {
      const project =
        projectId === undefined && projectName === undefined
          ? {}
          : { projectId: resolveProjectId({ projectId, projectName }) };
      const apply = (target: number) =>
        applyTicketUpdate(tickets, target, { ...changes, ...project });
      /** The Ticket as the result shows it, with the children it moved. */
      const shown = (
        { ticket, childrenMoved }: TicketUpdateResult,
        // The summary leaves out the fields these steps change.
        changed: Partial<Ticket> = {},
      ) => ({
        ...(detail === 'full'
          ? ticket
          : { ...ticketSummary(ticket), ...changed }),
        ...(childrenMoved ? { childrenMoved } : {}),
      });
      if (typeof number === 'number') {
        return respond(() => {
          const result = apply(number);
          const { blockedBy, epic, archived } = result.ticket;
          return shown(result, {
            ...(changes.addBlockers || changes.removeBlockers
              ? { blockedBy }
              : {}),
            ...(changes.epicNumber === undefined
              ? {}
              : { epicNumber: epic?.number ?? null }),
            ...(changes.archived === undefined ? {} : { archived }),
          });
        });
      }
      return respondBatch(() => {
        if (changes.before !== undefined || changes.after !== undefined) {
          throw new TicketsError(
            'Move one Ticket at a time with before or after: give number as a single Ticket.',
          );
        }
        const refusal = checkBatchNumbers(number);
        if (refusal) {
          throw new TicketsError(refusal);
        }
        const updated: TicketUpdateResult[] = [];
        const failed: { number: number; error: string }[] = [];
        for (const target of number) {
          try {
            updated.push(apply(target));
          } catch (error) {
            if (!(error instanceof TicketsError)) {
              throw error;
            }
            failed.push({ number: target, error: error.message });
          }
        }
        return { updated: updated.map((result) => shown(result)), failed };
      });
    },
  );
};
