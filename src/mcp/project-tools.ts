import { z } from 'zod';

import { TicketsError } from '../tickets/errors';
import { maxBatchSize } from '../tickets/rules';
import {
  agentProject,
  batchTicketNumbers,
  cycleId,
  cycleTitle,
  errorResult,
  hasProject,
  jsonResult,
  projectId,
  respond,
  respondBatch,
  status,
  type ToolContext,
  ticketNumber,
  withMoveHint,
} from './tool-shared';

export const registerProjectTools = ({
  tickets,
  resolveProjectId,
  registerTool,
}: ToolContext): void => {
  registerTool(
    'list_projects',
    {
      title: 'List Projects',
      description:
        'List all Projects, oldest first, with their id, name, archived flag and creation time. Call this before create_project to reuse an existing Project, and to find the projectId for Ticket tools. An archived Project is read-only, with its Tickets and Cycles, until the User restores it; its name stays taken.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => respond(() => tickets.listProjects().map(agentProject)),
  );

  registerTool(
    'create_project',
    {
      title: 'Create Project',
      description:
        'Create a Project and return it. Check list_projects first: names must be unique, ignoring case and surrounding spaces, and a taken name is refused.',
      inputSchema: {
        name: z
          .string()
          .describe('The Project name. Surrounding spaces are trimmed.'),
      },
    },
    ({ name }) => respond(() => agentProject(tickets.createProject({ name }))),
  );

  registerTool(
    'rename_project',
    {
      title: 'Rename Project',
      description:
        "Rename a Project and return it. Names must be unique, ignoring case and surrounding spaces; changing only the casing of the Project's own name is allowed. An archived Project cannot be renamed.",
      inputSchema: {
        id: projectId,
        name: z
          .string()
          .describe('The new Project name. Surrounding spaces are trimmed.'),
      },
      annotations: { idempotentHint: true },
    },
    ({ id, name }) =>
      respond(() => agentProject(tickets.renameProject(id, { name }))),
  );

  registerTool(
    'list_labels',
    {
      title: 'List labels',
      description:
        'List every label in use on any Ticket, archived ones included, sorted. Reuse one of these before inventing a new label.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => respond(() => tickets.listLabels()),
  );

  registerTool(
    'list_cycles',
    {
      title: 'List Cycles',
      description:
        "List a Project's Cycles, given by projectId or projectName, oldest first, each with its id, title (its goal), state (Prepared, Active or Archived), ticketNumbers (the Tickets planned into it; an Archived Cycle's are its final membership), createdAt and archivedAt (null unless Archived).",
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'The Project to list the Cycles of (id from list_projects). Give this or projectName.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'The name of the Project to list the Cycles of, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    ({ projectId, projectName }) =>
      respond(() =>
        tickets.listCycles(resolveProjectId({ projectId, projectName })),
      ),
  );

  registerTool(
    'get_project',
    {
      title: 'Get Project',
      description: `Read a Project, by default the one of your working folder's repository, or the one given by projectId or projectName. Returns { id, name, archived, createdAt, activeCycleId, cycles, labels }: activeCycleId is the id of the Active Cycle, or null when none is; cycles lists every Cycle oldest first, each with id, title (its goal), state (Prepared, Active or Archived), ticketNumbers (the Tickets planned into it; an Archived Cycle's are its final membership), createdAt and archivedAt; labels are the labels in use on its Tickets, archived ones included, sorted: reuse one before inventing another. With allProjects: true it instead lists every Project, oldest first, each with id, name, archived and createdAt; give no projectId or projectName then. An archived Project is read-only until the User restores it.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'The Project to read (id from get_project with allProjects). Give this or projectName, or neither for the Project of your folder.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'The name of the Project to read, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects.',
          ),
        allProjects: z
          .boolean()
          .optional()
          .describe(
            'List every Project instead of reading one. Not with projectId or projectName.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    ({ projectId, projectName, allProjects }) =>
      respond(() => {
        if (allProjects) {
          if (hasProject({ projectId, projectName })) {
            throw new TicketsError(
              'Give allProjects or a Project (projectId or projectName), not both.',
            );
          }
          return tickets.listProjects().map(agentProject);
        }
        const id = resolveProjectId({ projectId, projectName });
        const cycles = tickets.listCycles(id);
        return {
          ...agentProject(tickets.getProject(id)),
          activeCycleId:
            cycles.find((cycle) => cycle.state === 'Active')?.id ?? null,
          cycles,
          labels: tickets.listLabels({ projectId: id }),
        };
      }),
  );

  registerTool(
    'create_cycle',
    {
      title: 'Create Cycle',
      description:
        'Create a Prepared Cycle in a Project, by default the one of your working folder, or the one given by projectId or projectName, plan the Tickets in ticketNumbers into it, and return it with its ticketNumbers. It never starts the Cycle: the User does. Planning follows plan_ticket: any non-archived Ticket of the Project can be planned, Done ones included, and a Ticket is in at most one Cycle that is not Archived. All or nothing: when any Ticket cannot be planned, no Cycle is created and the error names each Ticket and why. A Project can have several Prepared Cycles.',
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            'The Project the Cycle belongs to (id from get_project with allProjects). Give this or projectName, or neither for the Project of your folder.',
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            'The name of the Project the Cycle belongs to, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.',
          ),
        title: cycleTitle,
        ticketNumbers: batchTicketNumbers
          .optional()
          .describe(
            `The Tickets to plan into the Cycle, each once, at most ${maxBatchSize}. Left out or empty, the Cycle starts empty.`,
          ),
      },
    },
    ({ projectId, projectName, title, ticketNumbers = [] }) =>
      respond(() => {
        const cycle = tickets.createCycle({
          projectId: resolveProjectId({ projectId, projectName }),
          title,
        });
        if (ticketNumbers.length === 0) {
          return cycle;
        }
        try {
          const planned = tickets.planTickets({
            cycleId: cycle.id,
            ticketNumbers,
          });
          if (planned.failed.length > 0) {
            throw new TicketsError(
              `No Cycle was created. ${planned.failed
                .map(
                  ({ number, error }) => `T${number}: ${withMoveHint(error)}`,
                )
                .join(' ')}`,
            );
          }
          return planned.cycle;
        } catch (error) {
          tickets.discardCycle(cycle.id);
          throw error;
        }
      }),
  );

  registerTool(
    'rename_cycle',
    {
      title: 'Rename Cycle',
      description:
        'Rename a Prepared or Active Cycle and return it. An Archived Cycle cannot change.',
      inputSchema: { cycleId, title: cycleTitle },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, title }) =>
      respond(() => tickets.renameCycle(cycleId, { title })),
  );

  registerTool(
    'plan_ticket',
    {
      title: 'Plan Ticket into Cycle',
      description:
        "Plan a Ticket into a Prepared or Active Cycle of its Project and return the Cycle. Any non-archived Ticket can be planned, Done ones included to record finished work, and a Ticket is in at most one Cycle that is not Archived: move_tickets moves it from its current one, or unplan_ticket it from that first. Planning doesn't change its Status, and a member that becomes Done or is archived stays in it.",
      inputSchema: { cycleId, number: ticketNumber },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, number }) => {
      try {
        return jsonResult(tickets.planTicket({ cycleId, number }));
      } catch (error) {
        return error instanceof TicketsError
          ? errorResult(new TicketsError(withMoveHint(error.message)))
          : errorResult(error);
      }
    },
  );

  registerTool(
    'unplan_ticket',
    {
      title: 'Unplan Ticket from Cycle',
      description:
        'Take a Ticket out of a Prepared or Active Cycle, back to the Backlog, and return the Cycle. An Archived Cycle cannot change.',
      inputSchema: { cycleId, number: ticketNumber },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, number }) =>
      respond(() => tickets.unplanTicket({ cycleId, number })),
  );

  registerTool(
    'plan_tickets',
    {
      title: 'Plan Tickets into Cycle',
      description: `Plan each of an explicit list of Ticket numbers, at most ${maxBatchSize} per call, into one Prepared or Active Cycle, by the rules of plan_ticket; a Ticket already in that Cycle counts as planned. Each Ticket's change is atomic; the batch is not. Returns { updated, failed, cycle }: the planned Ticket numbers, the number and error of each Ticket left unplanned, and the Cycle. If any Ticket failed the result is an error, but the Tickets in updated were still planned. A missing or Archived Cycle, or a bad list of numbers, is refused and changes nothing.`,
      inputSchema: { cycleId, ticketNumbers: batchTicketNumbers },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, ticketNumbers }) =>
      respondBatch(() => {
        const batch = tickets.planTickets({ cycleId, ticketNumbers });
        return {
          ...batch,
          failed: batch.failed.map(({ number, error }) => ({
            number,
            error: withMoveHint(error),
          })),
        };
      }),
  );

  registerTool(
    'unplan_tickets',
    {
      title: 'Unplan Tickets from Cycle',
      description: `Take each of an explicit list of Ticket numbers, at most ${maxBatchSize} per call, out of one Prepared or Active Cycle, back to the Backlog, by the rules of unplan_ticket. Returns { updated, failed, cycle } as plan_tickets does, and is an error when any Ticket failed, though the Tickets in updated were still unplanned. A missing or Archived Cycle, or a bad list of numbers, is refused and changes nothing.`,
      inputSchema: { cycleId, ticketNumbers: batchTicketNumbers },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, ticketNumbers }) =>
      respondBatch(() => tickets.unplanTickets({ cycleId, ticketNumbers })),
  );

  registerTool(
    'move_tickets',
    {
      title: 'Move Tickets to Cycle or Backlog',
      description: `Move each of an explicit list of Ticket numbers, at most ${maxBatchSize} per call, into one Prepared or Active Cycle, or to the Backlog with cycleId null, in one step: each leaves the Cycle that is not Archived it is in, if any, and joins the target, by the rules of plan_ticket otherwise. A Done Ticket stays in an Archived Cycle that holds it. A Ticket already there counts as moved. Each Ticket's change is atomic; the batch is not. Returns { updated, failed, cycle }: the moved Ticket numbers, the number and error of each Ticket left where it was, and the target Cycle, or null for the Backlog. If any Ticket failed the result is an error, but the Tickets in updated were still moved. A missing or Archived Cycle, or a bad list of numbers, is refused and changes nothing.`,
      inputSchema: {
        cycleId: cycleId
          .nullable()
          .describe(
            'The id of the Cycle to move the Tickets into, as returned by list_cycles or create_cycle, or null for the Backlog.',
          ),
        ticketNumbers: batchTicketNumbers,
      },
      annotations: { idempotentHint: true },
    },
    ({ cycleId, ticketNumbers }) =>
      respondBatch(() =>
        tickets.moveTicketsToCycle({ cycleId, ticketNumbers }),
      ),
  );

  registerTool(
    'sort_lane',
    {
      title: "Sort a Status's Board order",
      description: `Set a Status's Board order in a Project, given by projectId or projectName, as the User does by dragging: the listed Tickets, at most ${maxBatchSize}, take the top slots in the order given, and the Status's other Tickets keep their order below them. List every Ticket for a full sort, or a few to rank them first. With cycleId it sorts only that Cycle's Board, or with null only the Backlog's; Tickets outside it keep their slots. Epics sort like any Ticket. It changes only the order, never a Status, Claim or Cycle: change a Status with update_ticket and a Cycle with move_tickets. Use it to rank work, never Blockers. A Board Lane, such as Queued (Todo with ready-for-agent), shows this order filtered by labels. All or nothing: a listed Ticket that is missing, archived, in another Project, not in the Status, or not on that Board refuses the whole call, naming it. Returns { ticketNumbers }: the Status's new order on the sorted Board, top first, as list_tickets with sort: "position" now lists it.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe(
            "The Project whose Status's Board order to set (id from list_projects). Give this or projectName.",
          ),
        projectName: z
          .string()
          .optional()
          .describe(
            "The name of the Project whose Status's Board order to set, ignoring case, in place of projectId. An unknown name is refused with the names of the existing Projects. Giving both is refused unless they name the same Project.",
          ),
        status: status.describe(
          'The Status whose Board order to set: "Todo", "In progress" or "Done".',
        ),
        cycleId: cycleId
          .nullable()
          .optional()
          .describe(
            "Sort only this Cycle's Board (id from list_cycles), or with null only the Backlog. Left out, the Status's order across the whole Project is set.",
          ),
        ticketNumbers: z
          .array(ticketNumber)
          .describe(
            `The Tickets to put on top of the Status's Board order, in order, each once, from 1 to ${maxBatchSize} of them.`,
          ),
      },
      annotations: { idempotentHint: true },
    },
    ({ projectId, projectName, ...input }) =>
      respond(() => ({
        ticketNumbers: tickets.sortLane({
          projectId: resolveProjectId({ projectId, projectName }),
          ...input,
        }),
      })),
  );

  registerTool(
    'start_cycle',
    {
      title: 'Start Cycle',
      description:
        "Make a Prepared Cycle its Project's Active Cycle and return it. While another Cycle is Active this is refused, unless confirmArchiveActive is true: then that Cycle is archived and its open, non-archived Tickets roll into this one, all in one step.",
      inputSchema: {
        cycleId,
        confirmArchiveActive: z
          .boolean()
          .optional()
          .describe(
            "Archive the Project's Active Cycle and roll its open Tickets into this one. Set it only once the User has agreed. Defaults to false.",
          ),
      },
    },
    ({ cycleId, confirmArchiveActive }) =>
      respond(() =>
        tickets.startCycle(cycleId, { archiveActive: confirmArchiveActive }),
      ),
  );

  registerTool(
    'archive_cycle',
    {
      title: 'Archive Cycle',
      description:
        'Archive the Active Cycle, finished or not, and return it. Its Tickets keep their Status: its unfinished ones leave it and return to the Backlog, and its Done ones stay with it as read-only history. Its Epics and their children are left as they are.',
      inputSchema: { cycleId },
    },
    ({ cycleId }) => respond(() => tickets.archiveCycle(cycleId)),
  );
};
