import { z } from 'zod';

import { NotAllowedError, TicketsError } from '../tickets/errors';
import { maxBatchSize } from '../tickets/rules';
import {
  agentProject,
  batchTicketNumbers,
  cycleId,
  cycleTitle,
  hasProject,
  projectId,
  refusalMessage,
  respond,
  type ToolContext,
  withChildren,
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
        return {
          ...agentProject(tickets.getProject(id)),
          activeCycleId: tickets.activeCycle(id)?.id ?? null,
          cycles: tickets.listCycles(id),
          labels: tickets.listLabels({ projectId: id }),
        };
      }),
  );

  registerTool(
    'create_cycle',
    {
      title: 'Create Cycle',
      description: `Create a Prepared Cycle in a Project, by default the one of your working folder, or the one given by projectId or projectName, plan the Tickets in ticketNumbers into it, and return it with its ticketNumbers. It never starts the Cycle: the User does. Planning: any non-archived Ticket of the Project can be planned, Done ones included, and a Ticket is in at most one Cycle that is not Archived. With withChildren: true, each Epic in ticketNumbers takes its unarchived children along, Done ones included, moving them out of any other Cycle that is not Archived; the result's childrenPlanned names the children it planned. All or nothing: when any Ticket cannot be planned, no Cycle is created, nothing moves, and the error names each Ticket and why. A Project can have several Prepared Cycles.`,
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
        withChildren: withChildren.describe(
          'Plan each Epic in ticketNumbers together with its unarchived children, Done ones included, moving them out of any other Cycle that is not Archived. Defaults to false: only the Tickets named are planned. Every Ticket in ticketNumbers must then be an Epic.',
        ),
      },
    },
    ({ projectId, projectName, title, ticketNumbers = [], withChildren }) =>
      respond(() =>
        // One transaction, so a refusal also undoes the children moved out
        // of other Cycles before it.
        tickets.transaction(() => {
          const cycle = tickets.createCycle({
            projectId: resolveProjectId({ projectId, projectName }),
            title,
          });
          if (ticketNumbers.length === 0) {
            return withChildren ? { ...cycle, childrenPlanned: [] } : cycle;
          }
          const planned = tickets.planTickets({
            cycleId: cycle.id,
            ticketNumbers,
            withChildren,
          });
          if (planned.failed.length > 0) {
            throw new TicketsError(
              `No Cycle was created. ${planned.failed
                .map(
                  ({ number, error, refusal }) =>
                    `T${number}: ${refusalMessage(error, refusal)}`,
                )
                .join(' ')}`,
            );
          }
          return planned.children
            ? { ...planned.cycle, childrenPlanned: planned.children }
            : planned.cycle;
        }),
      ),
  );

  registerTool(
    'update_cycle',
    {
      title: 'Update Cycle',
      description: `Rename a Prepared Cycle: its title is its goal, which planning may sharpen. Returns the Cycle with its ticketNumbers. Only a Prepared Cycle: renaming an Active or an Archived Cycle stays with the User, as do starting and archiving one, and the refusal names the Cycle's state. To change which Tickets are in it, use update_ticket (cycleId).`,
      inputSchema: {
        cycleId: cycleId.describe(
          'The Prepared Cycle to rename (id from get_project or create_cycle).',
        ),
        title: cycleTitle,
      },
    },
    ({ cycleId, title }) =>
      respond(() =>
        tickets.transaction(() => {
          const cycle = tickets.getCycle(cycleId);
          if (cycle.state !== 'Prepared') {
            throw new NotAllowedError(
              `The Cycle "${cycle.title}" is ${cycle.state}. An Agent may rename only a Prepared Cycle; the User renames an ${cycle.state} one.`,
            );
          }
          return tickets.renameCycle(cycleId, { title });
        }),
      ),
  );
};
