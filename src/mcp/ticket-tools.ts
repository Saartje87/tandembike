import { z } from 'zod';

import { paletteColors } from '../tickets/palette';
import { maxBatchSize } from '../tickets/rules';
import { ticketTypes } from '../tickets/ticket-type';
import {
  defaultPageSize,
  maxAcceptanceCriteria,
  maxPageSize,
  type Ticket,
  ticketDetails,
  ticketSorts,
  ticketSummary,
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
  respondEpicMembers,
  respondTicket,
  returnsEpicMembers,
  returnsSummary,
  status,
  summaryFields,
  type ToolContext,
  ticketNumber,
  withoutDescription,
  withPlaceholderNote,
} from './tool-shared';

export const registerTicketTools = ({
  tickets,
  cwd,
  resolveProjectId,
  registerTool,
}: ToolContext): void => {
  registerTool(
    'list_tickets',
    {
      title: 'List Tickets',
      description: `Find Tickets, oldest-created first or in Board order (sort), optionally only those in one Project (by projectId or projectName), in one or more Statuses, only Tickets or only Epics (type: "Epic" lists a Project's Epics without detail: "full"), only the children of one Epic (epicNumber lists an Epic's children with their Statuses and blocked flags, without get_ticket's description), with given labels, with any of given External references, split from one Origin, containing a search query and/or created or changed since a time (changedSince). Returns { tickets, nextCursor, total }: a page of at most limit Tickets, the cursor for the next page, or null on the last page, and total, how many Tickets match the filters over all pages, whatever the cursor. An empty tickets list means nothing matched. By default each Ticket is a summary: its number, title, status, type (Ticket or Epic), labels, blocked (whether any Blocker is unresolved), epicNumber (the Epic it is a child of, the same number the epicNumber filter takes, or null) and updatedAt, plus projectId when the list is not for one Project. With detail: "full", each is the whole Ticket: also its description, type, color, epic, blockedBy, claim, External references, acceptance criteria, children, Board position, archived flag and timestamps, as get_ticket returns it. Add description: false to leave each description out and keep everything else, which is much shorter when you need a Project's structure, labels or criteria.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'Only list Tickets in this Project (id from list_projects).',
          ),
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
            "Only list the children of this Epic. Combines with the other filters, such as status, blocked, claimed and labels. Use it to see an Epic's children, Statuses and blocked flags without reading the Epic with get_ticket.",
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
            "List Tickets of every Project. Without a Project, projectName or projectId, list_tickets lists the Project of your working folder when one contains it; true lists every Project's instead.",
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
            'Only list Tickets created or changed at or after this ISO 8601 timestamp with a time zone, such as 2026-11-07T23:05:00Z. An Epic also counts as changed when one of its children was created, attached, detached or changed since. Use it to check what other sessions changed before publishing work, such as list_tickets({ projectName, cycleId, type: "Epic", changedSince }) with the time you started.',
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
        "Get one Ticket by its number, including the full Markdown description and its acceptanceCriteria (each with id, text and checked, in order). Its type is Ticket or Epic, and color is the colour of an Epic, or null for a normal Ticket; epic is the Epic it is a child of ({ number, title, color }) or null, and an Epic lists its children, each with number, title, Status, archived, blockedBy and blocked. origin is the Ticket it was split from ({ number, title, status }) or null, and splitOff lists the Tickets split from it, each with number, title, status and archived. cycle is the Cycle whose Board it shows on ({ id, title, state }): the Prepared or Active Cycle it is planned into, else for a Done Ticket the most recently archived Cycle that kept it, else null for the Backlog. externalReferences lists the URLs and keys of the same work in other systems, in the order they were added. attachments lists its files (id, name, mediaType, size, author, createdAt; never the content), in the order added. Read it before starting work on the Ticket. Pass description: false to leave the description out and get everything else, which is much shorter when you only need an Epic's children with their Statuses and Blockers, or a Ticket's labels, claim or criteria.",
      inputSchema: {
        number: ticketNumber,
        description: z
          .boolean()
          .optional()
          .describe(
            'Whether to include the Markdown description. Defaults to true; false leaves it out and returns everything else unchanged.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    ({ number, description }) =>
      respond(() => {
        const ticket = tickets.getTicket(number);
        return description === false ? withoutDescription(ticket) : ticket;
      }),
  );

  registerTool(
    'create_ticket',
    {
      title: 'Create Ticket',
      description: `Create a Ticket in a Project, given by projectId or projectName, optionally planned into a Cycle. The title is required, one line and at most 200 characters; the description is optional Markdown of at most 50,000 characters; the Status defaults to Todo. ${returnsSummary({ subject: 'the new Ticket' })} The summary's number is the new Ticket number.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'The Project the Ticket belongs to (id from list_projects). Give this or projectName.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'The name of the Project the Ticket belongs to, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
        ...newTicketFields,
        type: z
          .enum(ticketTypes)
          .optional()
          .describe(
            "Ticket, the default, or Epic: a Ticket that groups child Tickets of its Project. Fixed once created. An Epic's Status follows its children (Done when every child is Done or archived, Todo with none or when every child that is not archived is Todo, In progress otherwise), so give it none.",
          ),
        color: epicColor
          .optional()
          .describe(
            `For an Epic: its colour, one of ${paletteColors.join(', ')}. Left out, it gets the colour fewest live Epics in the Project use. Only an Epic has a colour.`,
          ),
        epicNumber: ticketNumber
          .optional()
          .describe(
            'Create the Ticket as a child of this Epic, which must be in the same Project.',
          ),
        originNumber: originNumber.optional(),
        cycleId: cycleId
          .optional()
          .describe(
            'Plan the Ticket into this Cycle, by the rules of plan_ticket: it must be Prepared or Active and in the same Project. A refused Cycle creates nothing.',
          ),
        detail,
      },
    },
    ({ projectId, projectName, detail, ...input }) =>
      respondTicket(detail, () =>
        tickets.createTicket({
          ...input,
          projectId: resolveProjectId({ projectId, projectName }),
        }),
      ),
  );

  registerTool(
    'create_tickets',
    {
      title: 'Create Tickets',
      description: `Create from 1 to ${maxBatchSize} Tickets in one Project, given by projectId or projectName, optionally planned into a Cycle, in one call, in order, with the Blockers between them given by position, instead of one create_ticket and add_blocker call each. To refer to another Ticket of the batch in a title, description or acceptance criterion, write {{T:n}}, n being its position counted from 0: it is replaced by that Ticket's number, such as T42, in the same call, wherever it stands in the text (code included), and may name a later Ticket or the Ticket itself. A position outside the batch refuses it. Do not guess numbers; they are shared by all Projects. Length limits apply after the replacement. All or nothing: if any Ticket breaks a rule, none is created and the error names it by position. A Ticket may also be an Epic (type "Epic", with an optional color) and the Tickets after it may be its children (epicPosition), or be split from an earlier one (originPosition), so an Epic or a spec and its Tickets are created atomically. Returns { numbers }: the new Ticket numbers, in the order given.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'The Project the Tickets belong to (id from list_projects). Give this or projectName.',
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
            'Plan every Ticket into this Cycle, by the rules of plan_ticket: it must be Prepared or Active and in the same Project. A refused Cycle creates none.',
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
              blockedByPositions: z
                .array(z.number().int())
                .optional()
                .describe(
                  'The positions, counted from 0, of earlier Tickets in this list that block this one. Only earlier positions can be named, so list the Tickets in dependency order.',
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
          })
          .map(({ number }) => number),
      })),
  );

  registerTool(
    'update_ticket',
    {
      title: 'Update Ticket',
      description: `Change any subset of a Ticket's title, description, Status, an Epic's color, Project (by projectId or projectName), Origin, labels, External references and acceptance criteria in one atomic change. Fields left out stay as they are. Use it to move a Ticket to "In progress" when you start and to "Done" when you finish, and to swap a triage state label with removeLabels and addLabels together. To finish a Ticket or an Epic once its work is merged, use complete_ticket, which applies the whole completion rule; setting Done here leaves the labels as they are. The same rules apply as for create_ticket. ${returnsSummary()}`,
      inputSchema: {
        number: ticketNumber,
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
            'Move the Ticket to this Project (id from list_projects). A child, or an Epic with children, cannot move.',
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
            `The Ticket's whole new list of acceptance criteria, in order, at most ${maxAcceptanceCriteria}. Criteria left out are removed; an empty list removes them all. To only check or uncheck criteria, use set_acceptance_criteria_checked.`,
          ),
        detail,
      },
    },
    ({ number, projectId, projectName, detail, ...changes }) =>
      respondTicket(detail, () =>
        tickets.updateTicket(number, {
          ...changes,
          ...(projectId === undefined && projectName === undefined
            ? {}
            : {
                projectId: resolveProjectId({ projectId, projectName }),
              }),
        }),
      ),
  );

  registerTool(
    'update_tickets',
    {
      title: 'Update Tickets',
      description: `Apply the same Status, Epic color and/or label change to each of an explicit list of Ticket numbers, at most ${maxBatchSize} per call, by the rules of update_ticket. To finish Tickets or an Epic once their work is merged, use complete_ticket for each, which applies the whole completion rule; setting Done here leaves the labels as they are. Each Ticket's change is atomic; the batch is not. Returns { updated, failed }: a summary of each changed Ticket (${summaryFields}), or with detail: "full" the whole Ticket, and the number and error of each Ticket left unchanged. If any Ticket failed the result is an error, but the Tickets in updated were still changed. A bad change or list of numbers is refused and changes nothing.`,
      inputSchema: {
        ticketNumbers: batchTicketNumbers,
        status: status.optional().describe('The new Status.'),
        color: epicColor
          .optional()
          .describe(
            'A new colour for each Epic given. Only an Epic has a colour, so a normal Ticket given fails.',
          ),
        addLabels,
        removeLabels,
        detail,
      },
    },
    ({ detail, ...input }) =>
      respondBatch(() => {
        const batch = tickets.updateTickets(input);
        return detail === 'full'
          ? batch
          : { ...batch, updated: batch.updated.map(ticketSummary) };
      }),
  );

  registerTool(
    'attach_to_epic',
    {
      title: 'Attach Tickets to Epic',
      description: `Make existing normal Tickets children of an Epic in the same Project. An Epic cannot be a child, a Ticket is in at most one Epic (detach_from_epic it first), and a Ticket that blocks or is blocked by the Epic cannot join it. A Ticket in the Epic already stays as it is. All or nothing: if any Ticket cannot join, none does, and the error names every one that cannot and why. To create a new Epic with its children, use create_tickets instead. ${returnsEpicMembers('the Epic')}`,
      inputSchema: {
        epic: ticketNumber.describe('The Epic, e.g. 41 for T41.'),
        ticketNumbers: batchTicketNumbers.describe(
          `The Tickets to make its children, each once, from 1 to ${maxBatchSize} of them.`,
        ),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ epic, ticketNumbers, detail }) =>
      respondEpicMembers(detail, () =>
        tickets.attachTicketsToEpic({ epic, children: ticketNumbers }),
      ),
  );

  registerTool(
    'detach_from_epic',
    {
      title: 'Detach Tickets from Epic',
      description: `Take Tickets out of their Epics; they may be in different Epics, and each Epic's Status follows. A Ticket in no Epic stays as it is. All or nothing: if any Ticket cannot leave, none does, and the error names every one. ${returnsEpicMembers('null')}`,
      inputSchema: { ticketNumbers: batchTicketNumbers, detail },
      annotations: { idempotentHint: true },
    },
    ({ ticketNumbers, detail }) =>
      respondEpicMembers(detail, () =>
        tickets.detachTicketsFromEpic(ticketNumbers),
      ),
  );

  registerTool(
    'add_ticket_labels',
    {
      title: 'Add Ticket labels',
      description: `Add labels to a Ticket. Labels are trimmed and lower-cased; ones the Ticket already has are kept once. ${returnsSummary()}`,
      inputSchema: {
        number: ticketNumber,
        labels: z.array(label).describe('The labels to add, at least one.'),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, labels, detail }) =>
      respondTicket(detail, () => tickets.addLabels(number, labels)),
  );

  registerTool(
    'remove_ticket_labels',
    {
      title: 'Remove Ticket labels',
      description: `Remove labels from a Ticket. Matching ignores case; labels the Ticket does not have are ignored. ${returnsSummary()}`,
      inputSchema: {
        number: ticketNumber,
        labels: z.array(label).describe('The labels to remove, at least one.'),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, labels, detail }) =>
      respondTicket(detail, () => tickets.removeLabels(number, labels)),
  );

  registerTool(
    'list_blockers',
    {
      title: 'List Blockers',
      description:
        'List the Tickets that block a Ticket (blockedBy) and the Tickets it blocks (blocks), each by number with its title, Status, projectId, archived flag and resolved (true once it is Done or archived). Archived Tickets keep their Blockers.',
      inputSchema: { number: ticketNumber },
      annotations: { readOnlyHint: true },
    },
    ({ number }) => respond(() => tickets.listBlockers(number)),
  );

  registerTool(
    'add_blocker',
    {
      title: 'Add Blocker',
      description: `Record that the blocker Ticket must be resolved (Done or archived) before the blocked Ticket can start. The two may be in different Projects. A Ticket cannot block itself, a Blocker that would make a cycle is refused, and Blockers between an Epic and its own children are refused: order the children with Blockers among themselves. Adding one that exists already changes nothing. ${returnsSummary({ subject: 'the blocked Ticket', extra: 'blockedBy, the numbers of the Tickets that block it' })}`,
      inputSchema: {
        blocker: ticketNumber.describe(
          'The Ticket that must be resolved first, e.g. 41 for T41.',
        ),
        blocked: ticketNumber.describe(
          'The Ticket that waits for it, e.g. 42 for T42.',
        ),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ detail, ...input }) =>
      respondTicket(
        detail,
        () => tickets.addBlocker(input),
        ({ blockedBy }) => ({ blockedBy }),
      ),
  );

  registerTool(
    'remove_blocker',
    {
      title: 'Remove Blocker',
      description: `Stop the blocker Ticket blocking the blocked Ticket. Removing a Blocker the Ticket does not have changes nothing. ${returnsSummary({ subject: 'the blocked Ticket', extra: 'blockedBy, the numbers of the Tickets that still block it' })}`,
      inputSchema: {
        blocker: ticketNumber.describe(
          'The Ticket that blocks, e.g. 41 for T41.',
        ),
        blocked: ticketNumber.describe(
          'The Ticket it blocks, e.g. 42 for T42.',
        ),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ detail, ...input }) =>
      respondTicket(
        detail,
        () => tickets.removeBlocker(input),
        ({ blockedBy }) => ({ blockedBy }),
      ),
  );

  registerTool(
    'archive_ticket',
    {
      title: 'Archive Ticket',
      description: `Archive a Ticket. It leaves the Board and list_tickets (unless includeArchived is set) but keeps everything; restore_ticket brings it back. An Epic cannot be archived while any child is not archived. Agents cannot delete Tickets; the User can, from the app. ${returnsSummary({ extra: 'archived' })}`,
      inputSchema: { number: ticketNumber, detail },
      annotations: { idempotentHint: true },
    },
    ({ number, detail }) =>
      respondTicket(
        detail,
        () => tickets.archiveTicket(number),
        ({ archived }) => ({ archived }),
      ),
  );

  registerTool(
    'restore_ticket',
    {
      title: 'Restore Ticket',
      description: `Bring an archived Ticket back onto the Board exactly as it was. Restoring an Epic also brings back the children archived with it, but not ones archived before it. ${returnsSummary({ extra: 'archived' })}`,
      inputSchema: { number: ticketNumber, detail },
      annotations: { idempotentHint: true },
    },
    ({ number, detail }) =>
      respondTicket(
        detail,
        () => tickets.restoreTicket(number),
        ({ archived }) => ({ archived }),
      ),
  );
};
