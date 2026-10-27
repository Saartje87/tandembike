import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../../../test/render';
import { createTestTickets } from '../../../../test/tickets';
import { appTickets } from '../../../../tickets/app-tickets';
import { BoardTicketDrawer } from './board-ticket-drawer';

vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock('../../../../components/ticket-drawer/ticket-drawer', () => ({
  TicketDrawer: ({
    ticket,
    comments,
    activity,
    boardPath,
    epics,
    epicChildren,
    referenceTemplates,
  }: {
    ticket: { number: number };
    comments: { body: string }[];
    activity: { changes: { type: string }[] }[];
    boardPath: string;
    epics: unknown;
    epicChildren: unknown;
    referenceTemplates: { prefix: string }[];
  }) => (
    <div
      role="dialog"
      data-epics={JSON.stringify(epics)}
      data-reference-prefixes={referenceTemplates
        .map(({ prefix }) => prefix)
        .join(' ')}
      data-epic-children={JSON.stringify(epicChildren)}
    >
      {`Ticket drawer T${ticket.number} over ${boardPath} comments: ${comments.map(({ body }) => body).join(',')} activity: ${activity.flatMap(({ changes }) => changes.map(({ type }) => type)).join(',')}`}
    </div>
  ),
}));

/** Tickets with a Project "Website" holding T1, and another holding T2. */
function setUp() {
  const tickets = createTestTickets();
  const website = tickets.createProject({ name: 'Website' });
  const app = tickets.createProject({ name: 'App' });
  const ticket = tickets.createTicket({
    projectId: website.id,
    title: 'Fix the header',
  });
  const elsewhere = tickets.createTicket({ projectId: app.id, title: 'Other' });
  tickets.addComment(ticket.number, { body: 'Started.', author: 'agent' });
  vi.mocked(appTickets).mockReturnValue(tickets);
  return { tickets, website, ticket, elsewhere };
}

describe('BoardTicketDrawer', () => {
  it("renders a Ticket's drawer over the Board it was opened on", async () => {
    const { website, ticket } = setUp();

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: ticket.number,
            boardPath: '/project/1/cycle/7',
          })
        }
      </div>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Ticket drawer T${ticket.number} over /project/1/cycle/7 comments: Started. activity: created`,
    );
  });

  it("offers the Project's live Epics to attach the Ticket to", async () => {
    const { tickets, website, ticket } = setUp();
    const epic = tickets.createTicket({
      projectId: website.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const archived = tickets.createTicket({
      projectId: website.id,
      title: 'Old',
      type: 'Epic',
    });
    tickets.archiveTicket(archived.number);

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: ticket.number,
            boardPath: '/project/1',
          })
        }
      </div>,
    );

    expect(
      JSON.parse(screen.getByRole('dialog').dataset.epics ?? 'null'),
    ).toEqual([{ number: epic.number, title: 'Checkout', color: 'red' }]);
  });

  it("links keys by the Reference templates of the Ticket's Project, after a move too", async () => {
    const { tickets, website, ticket } = setUp();
    const app = tickets.createProject({ name: 'Mobile' });
    tickets.addReferenceTemplate(website.id, {
      prefix: '#',
      url: 'https://github.com/acme/web/issues/{n}',
    });
    tickets.addReferenceTemplate(app.id, {
      prefix: 'ABC-',
      url: 'https://acme.atlassian.net/browse/ABC-{n}',
    });
    const drawerFor = async (projectId: number) =>
      renderWithTheme(
        <div>
          {
            await BoardTicketDrawer({
              projectId,
              number: ticket.number,
              boardPath: '/project/1',
            })
          }
        </div>,
      );

    const { unmount } = await drawerFor(website.id);
    expect(screen.getByRole('dialog').dataset.referencePrefixes).toBe('#');
    unmount();

    tickets.updateTicket(ticket.number, { projectId: app.id });
    await drawerFor(app.id);
    expect(screen.getByRole('dialog').dataset.referencePrefixes).toBe('ABC-');
  });

  it('renders nothing for a Ticket that does not exist (any more)', async () => {
    const { tickets, website, ticket } = setUp();
    tickets.deleteTicket(ticket.number);

    expect(
      await BoardTicketDrawer({
        projectId: website.id,
        number: ticket.number,
        boardPath: '/project/1',
      }),
    ).toBeNull();
  });

  it("renders nothing for another Project's Ticket", async () => {
    const { website, elsewhere } = setUp();

    expect(
      await BoardTicketDrawer({
        projectId: website.id,
        number: elsewhere.number,
        boardPath: '/project/1',
      }),
    ).toBeNull();
  });

  it("gives an Epic's drawer each child's Claim and the Tickets it blocks", async () => {
    const { tickets, website } = setUp();
    const epic = tickets.createTicket({
      projectId: website.id,
      title: 'Launch',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: website.id,
      title: 'Build',
      epicNumber: epic.number,
    });
    tickets.claimTicket(child.number, { agentRunId: 'run-1' });
    tickets.addBlocker({ blocker: child.number, blocked: 1 });

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: epic.number,
            boardPath: '/project/1',
          })
        }
      </div>,
    );

    expect(
      JSON.parse(
        screen.getByRole('dialog').getAttribute('data-epic-children') ?? '',
      ),
    ).toEqual([
      {
        number: child.number,
        title: 'Build',
        claim: { agentRunId: 'run-1', agentName: null },
        blocks: [expect.objectContaining({ number: 1 })],
      },
    ]);
  });
});
