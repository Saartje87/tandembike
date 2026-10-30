// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../test/tickets';
import type { Status } from './status';

describe('Stats', () => {
  it('has a row of zeros per non-archived Project, in id order', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const old = tickets.createProject({ name: 'Old' });
    const api = tickets.createProject({ name: 'API' });
    tickets.archiveProject(old.id);

    const { projects } = tickets.getStats();

    expect(projects.map(({ project }) => project.name)).toEqual([
      website.name,
      api.name,
    ]);
    expect(projects[0]).toEqual({
      project: website,
      todo: 0,
      inProgress: 0,
      blocked: 0,
      claimed: 0,
      activeCycle: null,
      doneLast7Days: 0,
    });
  });

  it('counts Todo and In progress Tickets, leaving out Epics and archived ones', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const create = (title: string, status: Status) =>
      tickets.createTicket({ projectId: project.id, title, status });
    create('Header', 'Todo');
    create('Footer', 'Todo');
    create('Menu', 'In progress');
    create('Logo', 'Done');
    tickets.archiveTicket(create('Old', 'Todo').number);
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Redesign',
      type: 'Epic',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Colours',
      status: 'In progress',
      epicNumber: epic.number,
    });

    const [row] = tickets.getStats().projects;

    expect(row).toMatchObject({ todo: 2, inProgress: 2 });
  });

  it('counts blocked and claimed Tickets, leaving out Epics and archived ones', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const create = (title: string, status: Status = 'Todo') =>
      tickets.createTicket({ projectId: project.id, title, status }).number;
    const open = create('Open blocker');
    const done = create('Done blocker', 'Done');
    const blocked = create('Blocked');
    const blockedDone = create('Blocked but Done');
    const unblocked = create('Blocker resolved');
    const blockedArchived = create('Blocked but archived');
    tickets.addBlocker({ blocker: open, blocked });
    tickets.addBlocker({ blocker: open, blocked: blockedDone });
    tickets.updateTicket(blockedDone, { status: 'Done' });
    tickets.addBlocker({ blocker: done, blocked: unblocked });
    tickets.addBlocker({ blocker: open, blocked: blockedArchived });
    tickets.archiveTicket(blockedArchived);
    const claim = (number: number, agentRunId: string) =>
      tickets.claimTicket(number, { agentRunId });
    claim(open, 'run-1');
    claim(blocked, 'run-2');
    const archivedClaim = create('Claimed but archived');
    claim(archivedClaim, 'run-3');
    tickets.archiveTicket(archivedClaim);

    const [row] = tickets.getStats().projects;

    expect(row).toMatchObject({ blocked: 1, claimed: 2 });
  });

  it("shows the Active Cycle's Done/total over its non-Epic Tickets, archived ones included", () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const api = tickets.createProject({ name: 'API' });
    const planned = tickets.createCycle({
      projectId: website.id,
      title: 'Next',
    });
    const cycle = tickets.createCycle({
      projectId: website.id,
      title: 'Launch',
    });
    const create = (title: string, status: Status, cycleId = cycle.id) =>
      tickets.createTicket({ projectId: website.id, title, status, cycleId })
        .number;
    create('Header', 'Done');
    create('Footer', 'Todo');
    tickets.archiveTicket(create('Logo', 'Done'));
    create('Later', 'Done', planned.id);
    tickets.createTicket({
      projectId: website.id,
      title: 'Redesign',
      type: 'Epic',
      cycleId: cycle.id,
    });
    tickets.startCycle(cycle.id);

    const [websiteRow, apiRow] = tickets.getStats().projects;

    expect(websiteRow.activeCycle).toEqual({
      id: cycle.id,
      title: 'Launch',
      done: 2,
      total: 3,
    });
    expect(apiRow.project.id).toBe(api.id);
    expect(apiRow.activeCycle).toBeNull();
  });

  it('sums every count across Projects and counts the Active Cycles', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const api = tickets.createProject({ name: 'API' });
    tickets.createProject({ name: 'Docs' });
    const archived = tickets.createProject({ name: 'Old' });
    const blocker = tickets.createTicket({
      projectId: website.id,
      title: 'Header',
    });
    const blocked = tickets.createTicket({
      projectId: api.id,
      title: 'Endpoint',
      status: 'In progress',
    });
    tickets.addBlocker({ blocker: blocker.number, blocked: blocked.number });
    tickets.claimTicket(blocked.number, { agentRunId: 'run-1' });
    tickets.createTicket({ projectId: api.id, title: 'Auth', status: 'Done' });
    tickets.createTicket({ projectId: archived.id, title: 'Legacy' });
    for (const project of [website, api, archived]) {
      const cycle = tickets.createCycle({
        projectId: project.id,
        title: 'Launch',
      });
      tickets.startCycle(cycle.id);
    }
    tickets.archiveProject(archived.id);

    expect(tickets.getStats().total).toEqual({
      todo: 1,
      inProgress: 1,
      blocked: 1,
      claimed: 1,
      doneLast7Days: 1,
      activeCycles: 2,
    });
  });

  describe('Done in the last 7 days', () => {
    const day = 24 * 60 * 60 * 1000;
    const start = new Date('2026-03-01T09:00:00Z');
    const daysLater = (days: number) =>
      vi.setSystemTime(start.getTime() + days * day);

    beforeEach(() => {
      vi.useFakeTimers({ now: start });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const setUp = () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      const create = (title: string, status: Status = 'Todo') =>
        tickets.createTicket({ projectId: project.id, title, status }).number;
      const move = (number: number, status: Status) =>
        tickets.updateTicket(number, { status });
      const doneLast7Days = () =>
        tickets.getStats().projects.map((row) => row.doneLast7Days);
      return { tickets, project, create, move, doneLast7Days };
    };

    it('counts a Ticket moved to Done within the last 7 days', () => {
      const { create, move, doneLast7Days } = setUp();
      move(create('Header'), 'Done');
      daysLater(1);
      move(create('Footer'), 'Done');

      daysLater(7.5);

      expect(doneLast7Days()).toEqual([1]);
    });

    it('counts a Ticket created in Done', () => {
      const { create, doneLast7Days } = setUp();
      create('Header', 'Done');
      daysLater(3);

      expect(doneLast7Days()).toEqual([1]);
    });

    it('counts a Ticket moved to Done twice once', () => {
      const { create, move, doneLast7Days } = setUp();
      const number = create('Header');
      move(number, 'Done');
      move(number, 'In progress');
      move(number, 'Done');

      expect(doneLast7Days()).toEqual([1]);
    });

    it('counts a Ticket by its latest move to Done', () => {
      const { create, move, doneLast7Days } = setUp();
      const number = create('Header', 'Done');
      daysLater(10);
      move(number, 'In progress');
      move(number, 'Done');
      daysLater(12);

      expect(doneLast7Days()).toEqual([1]);
    });

    it('leaves out a Ticket reopened after Done', () => {
      const { create, move, doneLast7Days } = setUp();
      const number = create('Header');
      move(number, 'Done');
      move(number, 'In progress');

      expect(doneLast7Days()).toEqual([0]);
    });

    it('counts a Ticket archived after Done', () => {
      const { tickets, create, doneLast7Days } = setUp();
      tickets.archiveTicket(create('Header', 'Done'));

      expect(doneLast7Days()).toEqual([1]);
    });

    it('counts a Ticket under the Project it moved to after Done', () => {
      const { tickets, create, doneLast7Days } = setUp();
      const api = tickets.createProject({ name: 'API' });
      const number = create('Header', 'Done');
      tickets.updateTicket(number, { projectId: api.id });

      expect(doneLast7Days()).toEqual([0, 1]);
    });

    it('leaves out Epics', () => {
      const { tickets, project, doneLast7Days } = setUp();
      const epic = tickets.createTicket({
        projectId: project.id,
        title: 'Redesign',
        type: 'Epic',
      });
      tickets.createTicket({
        projectId: project.id,
        title: 'Colours',
        status: 'Done',
        epicNumber: epic.number,
      });

      expect(tickets.getTicket(epic.number).status).toBe('Done');
      expect(doneLast7Days()).toEqual([1]);
    });
  });
});
