// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { type ChangeChannel, createChangeChannel } from './changes';
import { NotFoundError, ValidationError } from './errors';
import { maxAcceptanceCriteria, maxAcceptanceCriterionLength } from './tickets';

function ticketsWithOne() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the header',
  });
  return { tickets, project, ticket };
}

function ticketWithCriteria(changes?: ChangeChannel) {
  const tickets = createTestTickets(changes);
  const project = tickets.createProject({ name: 'Website' });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the header',
    acceptanceCriteria: [
      { text: 'The logo is centred', checked: true },
      { text: 'The menu collapses on phones', checked: true },
      { text: 'The header is sticky' },
    ],
  });
  const [logo, menu, sticky] = ticket.acceptanceCriteria;
  return { tickets, ticket, logo, menu, sticky };
}

/** The criteria of `ticket` without their ids, in order. */
function criteriaOf(ticket: {
  acceptanceCriteria: { text: string; checked: boolean }[];
}) {
  return ticket.acceptanceCriteria.map(({ text, checked }) => ({
    text,
    checked,
  }));
}

describe('Acceptance criteria', () => {
  it('gives a new Ticket no acceptance criteria', () => {
    const { tickets, ticket } = ticketsWithOne();

    expect(ticket.acceptanceCriteria).toEqual([]);
    expect(tickets.getTicket(ticket.number).acceptanceCriteria).toEqual([]);
  });

  it('creates a Ticket with acceptance criteria, in order and trimmed', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      acceptanceCriteria: [
        { text: '  The logo is centred ' },
        { text: 'The menu collapses on phones', checked: true },
      ],
    });

    const expected = [
      { text: 'The logo is centred', checked: false },
      { text: 'The menu collapses on phones', checked: true },
    ];
    expect(criteriaOf(ticket)).toEqual(expected);
    expect(criteriaOf(tickets.getTicket(ticket.number))).toEqual(expected);
  });

  it.each([
    ['empty', '   ', 'Enter text for each acceptance criterion.'],
    [
      'more than one line',
      'Logo\ncentred',
      'Keep each acceptance criterion to one line.',
    ],
    [
      'too long',
      'x'.repeat(maxAcceptanceCriterionLength + 1),
      `Keep each acceptance criterion to ${maxAcceptanceCriterionLength} characters or fewer.`,
    ],
  ])('refuses a criterion that is %s, creating nothing', (_, text, reason) => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const error = errorFrom(() =>
      tickets.createTicket({
        projectId: project.id,
        title: 'Fix the header',
        acceptanceCriteria: [{ text: 'The logo is centred' }, { text }],
      }),
    );

    expect(error).toEqual(new ValidationError({ acceptanceCriteria: reason }));
    expect(tickets.listTickets()).toEqual([]);
  });

  it('refuses more criteria than a Ticket can have', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const error = errorFrom(() =>
      tickets.createTicket({
        projectId: project.id,
        title: 'Fix the header',
        acceptanceCriteria: Array.from(
          { length: maxAcceptanceCriteria + 1 },
          (_, index) => ({ text: `Criterion ${index}` }),
        ),
      }),
    );

    expect(error).toEqual(
      new ValidationError({
        acceptanceCriteria: `Keep to ${maxAcceptanceCriteria} acceptance criteria or fewer.`,
      }),
    );
  });

  describe('replacing them with updateTicket', () => {
    it('adds, removes and reorders criteria, keeping the ids of those kept', () => {
      const { tickets, ticket, logo, sticky } = ticketWithCriteria();

      const updated = tickets.updateTicket(ticket.number, {
        acceptanceCriteria: [
          { id: sticky.id, text: 'The header is sticky' },
          { text: 'The search box is visible' },
          { id: logo.id, text: 'The logo is centred' },
        ],
      });

      expect(updated.acceptanceCriteria).toEqual([
        { id: sticky.id, text: 'The header is sticky', checked: false },
        {
          id: expect.any(Number),
          text: 'The search box is visible',
          checked: false,
        },
        { id: logo.id, text: 'The logo is centred', checked: true },
      ]);
      expect(tickets.getTicket(ticket.number).acceptanceCriteria).toEqual(
        updated.acceptanceCriteria,
      );
    });

    it('checks, unchecks and edits criteria; editing the text unchecks one', () => {
      const { tickets, ticket, logo, menu, sticky } = ticketWithCriteria();

      const updated = tickets.updateTicket(ticket.number, {
        acceptanceCriteria: [
          { id: logo.id, text: 'The logo is centred and larger' },
          { id: menu.id, text: 'The menu collapses on phones', checked: false },
          { id: sticky.id, text: ' The header is sticky ', checked: true },
        ],
      });

      expect(criteriaOf(updated)).toEqual([
        { text: 'The logo is centred and larger', checked: false },
        { text: 'The menu collapses on phones', checked: false },
        { text: 'The header is sticky', checked: true },
      ]);
    });

    it('removes every criterion given an empty list', () => {
      const { tickets, ticket } = ticketWithCriteria();

      const updated = tickets.updateTicket(ticket.number, {
        acceptanceCriteria: [],
      });

      expect(updated.acceptanceCriteria).toEqual([]);
    });

    it('leaves the criteria alone when they are not given', () => {
      const { tickets, ticket } = ticketWithCriteria();

      const updated = tickets.updateTicket(ticket.number, { title: 'Header' });

      expect(updated.acceptanceCriteria).toEqual(ticket.acceptanceCriteria);
    });

    it("refuses another Ticket's or an unknown criterion id, changing nothing", () => {
      const { tickets, ticket, logo } = ticketWithCriteria();
      const other = tickets.createTicket({
        projectId: ticket.projectId,
        title: 'Other',
        acceptanceCriteria: [{ text: 'Elsewhere' }],
      });
      const otherId = other.acceptanceCriteria[0].id;

      const error = errorFrom(() =>
        tickets.updateTicket(ticket.number, {
          title: 'Header',
          acceptanceCriteria: [
            { id: logo.id, text: 'The logo is centred' },
            { id: otherId, text: 'Elsewhere' },
          ],
        }),
      );

      expect(error).toEqual(
        new ValidationError({
          acceptanceCriteria: `Ticket T${ticket.number} has no acceptance criterion ${otherId}.`,
        }),
      );
      expect(tickets.getTicket(ticket.number)).toEqual(ticket);
    });

    it('refuses a criterion id given twice', () => {
      const { tickets, ticket, logo } = ticketWithCriteria();

      const error = errorFrom(() =>
        tickets.updateTicket(ticket.number, {
          acceptanceCriteria: [
            { id: logo.id, text: 'The logo is centred' },
            { id: logo.id, text: 'The logo is centred again' },
          ],
        }),
      );

      expect(error).toEqual(
        new ValidationError({
          acceptanceCriteria: `Give each acceptance criterion once: ${logo.id} is given twice.`,
        }),
      );
    });

    it('refuses invalid criterion text by the rules for creating them', () => {
      const { tickets, ticket } = ticketWithCriteria();

      const error = errorFrom(() =>
        tickets.updateTicket(ticket.number, {
          acceptanceCriteria: [{ text: '' }],
        }),
      );

      expect(error).toEqual(
        new ValidationError({
          acceptanceCriteria: 'Enter text for each acceptance criterion.',
        }),
      );
      expect(tickets.getTicket(ticket.number)).toEqual(ticket);
    });

    it('says when the Ticket does not exist', () => {
      const tickets = createTestTickets();

      expect(
        errorFrom(() =>
          tickets.updateTicket(42, { acceptanceCriteria: [{ text: 'Done' }] }),
        ),
      ).toEqual(new NotFoundError('There is no Ticket T42.'));
    });
  });

  describe('checking them with setAcceptanceCriteriaChecked', () => {
    it('checks and unchecks the criteria given, leaving the rest alone', () => {
      const { tickets, ticket, logo, sticky } = ticketWithCriteria();

      const updated = tickets.setAcceptanceCriteriaChecked(ticket.number, [
        { id: logo.id, checked: false },
        { id: sticky.id, checked: true },
      ]);

      const expected = [
        { text: 'The logo is centred', checked: false },
        { text: 'The menu collapses on phones', checked: true },
        { text: 'The header is sticky', checked: true },
      ];
      expect(criteriaOf(updated)).toEqual(expected);
      expect(criteriaOf(tickets.getTicket(ticket.number))).toEqual(expected);
    });

    it('bumps the updated time, but not the Status', () => {
      vi.useFakeTimers({ now: new Date('2026-03-01T09:00:00Z') });
      try {
        const { tickets, ticket, sticky } = ticketWithCriteria();
        vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));

        const updated = tickets.setAcceptanceCriteriaChecked(ticket.number, [
          { id: sticky.id, checked: true },
        ]);

        expect(updated.updatedAt).toEqual(new Date('2026-03-01T10:00:00Z'));
        expect(updated.status).toBe('Todo');
      } finally {
        vi.useRealTimers();
      }
    });

    it("refuses another Ticket's criterion, changing nothing", () => {
      const { tickets, ticket, logo } = ticketWithCriteria();
      const other = tickets.createTicket({
        projectId: ticket.projectId,
        title: 'Other',
        acceptanceCriteria: [{ text: 'Elsewhere' }],
      });
      const otherId = other.acceptanceCriteria[0].id;

      const error = errorFrom(() =>
        tickets.setAcceptanceCriteriaChecked(ticket.number, [
          { id: logo.id, checked: false },
          { id: otherId, checked: true },
        ]),
      );

      expect(error).toEqual(
        new ValidationError({
          acceptanceCriteria: `Ticket T${ticket.number} has no acceptance criterion ${otherId}.`,
        }),
      );
      expect(tickets.getTicket(ticket.number)).toEqual(ticket);
      expect(tickets.getTicket(other.number)).toEqual(other);
    });

    it.each([
      [[], 'Choose at least one acceptance criterion.'],
      [
        [
          { id: 1, checked: true },
          { id: 1, checked: false },
        ],
        'Give each acceptance criterion once: 1 is given twice.',
      ],
    ])('refuses the list %j', (criteria, reason) => {
      const { tickets, ticket } = ticketWithCriteria();

      expect(
        errorFrom(() =>
          tickets.setAcceptanceCriteriaChecked(ticket.number, criteria),
        ),
      ).toEqual(new ValidationError({ acceptanceCriteria: reason }));
    });

    it('says when the Ticket does not exist', () => {
      const tickets = createTestTickets();

      expect(
        errorFrom(() =>
          tickets.setAcceptanceCriteriaChecked(42, [{ id: 1, checked: true }]),
        ),
      ).toEqual(new NotFoundError('There is no Ticket T42.'));
    });
  });

  it('lists criteria with whole Tickets, but not in summaries', () => {
    const { tickets, ticket } = ticketWithCriteria();

    const [summary] = tickets.findTickets().tickets;
    const [whole] = tickets.findTickets({ detail: 'full' }).tickets;

    expect(summary).not.toHaveProperty('acceptanceCriteria');
    expect(whole).toEqual(ticket);
    expect(tickets.listTickets()).toEqual([ticket]);
  });

  it('announces each criteria change as a change to its Ticket', () => {
    const changes = createChangeChannel();
    const listener = vi.fn();
    changes.subscribe(listener);
    const { tickets, ticket, logo } = ticketWithCriteria(changes);
    listener.mockClear();

    tickets.updateTicket(ticket.number, {
      acceptanceCriteria: [{ id: logo.id, text: 'The logo is centred' }],
    });
    tickets.setAcceptanceCriteriaChecked(ticket.number, [
      { id: logo.id, checked: false },
    ]);

    expect(listener.mock.calls).toEqual([
      [{ type: 'ticket', number: ticket.number }],
      [{ type: 'ticket', number: ticket.number }],
    ]);
  });
});
