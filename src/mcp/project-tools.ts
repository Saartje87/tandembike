import { z } from 'zod';

import { TicketsError } from '../tickets/errors';
import { maxBatchSize } from '../tickets/rules';
import {
  agentProject,
  batchTicketNumbers,
  cycleTitle,
  hasProject,
  projectId,
  respond,
  type ToolContext,
  withMoveHint,
} from './tool-shared';

export const registerProjectTools = ({
  tickets,
  resolveProjectId,
  registerTool,
}: ToolContext): void => {
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
        'Create a Prepared Cycle in a Project, by default the one of your working folder, or the one given by projectId or projectName, plan the Tickets in ticketNumbers into it, and return it with its ticketNumbers. It never starts the Cycle: the User does. Planning: any non-archived Ticket of the Project can be planned, Done ones included, and a Ticket is in at most one Cycle that is not Archived. All or nothing: when any Ticket cannot be planned, no Cycle is created and the error names each Ticket and why. A Project can have several Prepared Cycles.',
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
};
