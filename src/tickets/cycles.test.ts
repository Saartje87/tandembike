// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { NotFoundError, ValidationError } from './errors';

/** A Tickets module with one Project. */
function ticketsWithProject() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  return { tickets, project };
}

describe('Cycles', () => {
  it('creates a Cycle in a Project, Prepared and with a trimmed title', () => {
    const { tickets, project } = ticketsWithProject();

    const cycle = tickets.createCycle({
      projectId: project.id,
      title: '  Launch the beta ',
    });

    expect(cycle).toEqual({
      id: expect.any(Number),
      projectId: project.id,
      title: 'Launch the beta',
      state: 'Prepared',
      createdAt: expect.any(Date),
    });
    expect(tickets.getCycle(cycle.id)).toEqual(cycle);
  });

  it('refuses a Cycle without a title, or in a Project that does not exist', () => {
    const { tickets, project } = ticketsWithProject();

    expect(
      errorFrom(() =>
        tickets.createCycle({ projectId: project.id, title: ' ' }),
      ),
    ).toEqual(new ValidationError({ title: 'Enter a title.' }));
    expect(
      errorFrom(() => tickets.createCycle({ projectId: 99, title: 'Beta' })),
    ).toEqual(new NotFoundError('There is no Project with id 99.'));
    expect(errorFrom(() => tickets.getCycle(99))).toEqual(
      new NotFoundError('There is no Cycle with id 99.'),
    );
  });

  it("lists a Project's Cycles oldest first, several Prepared at once", () => {
    const { tickets, project } = ticketsWithProject();
    const other = tickets.createProject({ name: 'App' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.createCycle({ projectId: other.id, title: 'Elsewhere' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });

    expect(tickets.listCycles(project.id)).toEqual([beta, launch]);
    expect(errorFrom(() => tickets.listCycles(99))).toEqual(
      new NotFoundError('There is no Project with id 99.'),
    );
  });

  it('renames a Cycle by the same rules as creating one', () => {
    const { tickets, project } = ticketsWithProject();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    const renamed = tickets.renameCycle(cycle.id, { title: ' Public beta ' });

    expect(renamed).toEqual({ ...cycle, title: 'Public beta' });
    expect(tickets.getCycle(cycle.id)).toEqual(renamed);
    expect(
      errorFrom(() => tickets.renameCycle(cycle.id, { title: '' })),
    ).toEqual(new ValidationError({ title: 'Enter a title.' }));
    expect(errorFrom(() => tickets.renameCycle(99, { title: 'Beta' }))).toEqual(
      new NotFoundError('There is no Cycle with id 99.'),
    );
  });

  it('discards a Prepared Cycle', () => {
    const { tickets, project } = ticketsWithProject();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });

    tickets.discardCycle(beta.id);

    expect(tickets.listCycles(project.id)).toEqual([launch]);
    expect(errorFrom(() => tickets.getCycle(beta.id))).toEqual(
      new NotFoundError(`There is no Cycle with id ${beta.id}.`),
    );
    expect(errorFrom(() => tickets.discardCycle(beta.id))).toEqual(
      new NotFoundError(`There is no Cycle with id ${beta.id}.`),
    );
  });

  it('announces each change to a Cycle', () => {
    const changes = createChangeChannel();
    const listener = vi.fn();
    changes.subscribe(listener);
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    listener.mockClear();

    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.renameCycle(cycle.id, { title: 'Launch' });
    tickets.discardCycle(cycle.id);

    expect(listener.mock.calls).toEqual([
      [{ type: 'cycle', id: cycle.id }],
      [{ type: 'cycle', id: cycle.id }],
      [{ type: 'cycle', id: cycle.id }],
    ]);
  });
});
