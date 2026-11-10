// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotFoundError } from './errors';

/** A Tickets module with one Project. */
function ticketsWithProject() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  return { tickets, project };
}

describe("A Project's Active Cycle", () => {
  it('is null for a Project without Cycles', () => {
    const { tickets, project } = ticketsWithProject();

    expect(tickets.activeCycle(project.id)).toBeNull();
  });

  it('is null while the Project only has a Prepared Cycle', () => {
    const { tickets, project } = ticketsWithProject();
    tickets.createCycle({ projectId: project.id, title: 'Beta' });

    expect(tickets.activeCycle(project.id)).toBeNull();
  });

  it('is the started Cycle, as listCycles gives it', () => {
    const { tickets, project } = ticketsWithProject();
    tickets.createCycle({ projectId: project.id, title: 'Later' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.startCycle(beta.id);

    expect(tickets.activeCycle(project.id)).toEqual(
      tickets.listCycles(project.id).find(({ id }) => id === beta.id),
    );
    expect(tickets.activeCycle(project.id)?.state).toBe('Active');
  });

  it('skips the Archived Cycles and those of other Projects', () => {
    const { tickets, project } = ticketsWithProject();
    const done = tickets.createCycle({ projectId: project.id, title: 'Done' });
    tickets.startCycle(done.id);
    tickets.archiveCycle(done.id);
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.startCycle(launch.id);
    const other = tickets.createProject({ name: 'Docs' });
    tickets.startCycle(
      tickets.createCycle({ projectId: other.id, title: 'Docs' }).id,
    );

    expect(tickets.activeCycle(project.id)?.id).toBe(launch.id);
  });

  it('refuses a Project that does not exist', () => {
    const { tickets } = ticketsWithProject();

    expect(errorFrom(() => tickets.activeCycle(999))).toBeInstanceOf(
      NotFoundError,
    );
  });
});
