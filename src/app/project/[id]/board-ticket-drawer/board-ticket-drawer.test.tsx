import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appAutopilot } from '../../../../autopilot/app-autopilot';
import { createAutopilot } from '../../../../autopilot/autopilot';
import { appConversations } from '../../../../conversations/app-conversations';
import { createTestConversations } from '../../../../test/conversations';
import { agentCommandEntries, agentCommands } from '../../../../test/fixtures';
import { renderWithTheme } from '../../../../test/render';
import { createTestSettings } from '../../../../test/settings';
import { appTickets } from '../../../../tickets/app-tickets';
import { createChangeChannel } from '../../../../tickets/changes';
import { BoardTicketDrawer } from './board-ticket-drawer';

vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock('../../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));
vi.mock('../../../../settings/app-settings', () => ({
  appSettings: () => createTestSettings(),
}));
vi.mock('../../../../autopilot/app-autopilot', () => ({
  appAutopilot: vi.fn(),
}));
vi.mock('../../../../components/ticket-drawer/ticket-drawer', () => ({
  TicketDrawer: ({
    ticket,
    comments,
    activity,
    epics,
    epicChildren,
    outsideBlockers,
    referenceTemplates,
    conversations,
    conversationFootprints,
    agentCommands,
    board,
    why,
  }: {
    ticket: { number: number };
    comments: { body: string }[];
    activity: { changes: { type: string }[] }[];
    epics: unknown;
    epicChildren: unknown;
    outsideBlockers: unknown;
    referenceTemplates: { prefix: string }[];
    conversations: unknown[];
    conversationFootprints: unknown;
    agentCommands: unknown;
    board: unknown;
    why: ReactNode;
  }) => (
    <div
      role="dialog"
      data-epics={JSON.stringify(epics)}
      data-footprints={JSON.stringify(conversationFootprints)}
      data-reference-prefixes={referenceTemplates
        .map(({ prefix }) => prefix)
        .join(' ')}
      data-epic-children={JSON.stringify(epicChildren)}
      data-outside-blockers={JSON.stringify(outsideBlockers)}
      data-conversations={conversations.length}
      data-conversation-intents={(conversations as { intent: string }[])
        .map(({ intent }) => intent)
        .join(' ')}
      data-agent-commands={JSON.stringify(agentCommands)}
      data-board={JSON.stringify(board)}
    >
      {why}
      {`Ticket drawer T${ticket.number} comments: ${comments.map(({ body }) => body).join(',')} activity: ${activity.flatMap(({ changes }) => changes.map(({ type }) => type)).join(',')}`}
    </div>
  ),
}));

/** Tickets with a Project "Website" holding T1, and another holding T2. */
function setUp() {
  const world = createTestConversations();
  const { tickets } = world;
  const website = tickets.createProject({ name: 'Website' });
  const app = tickets.createProject({ name: 'App' });
  const ticket = tickets.createTicket({
    projectId: website.id,
    title: 'Fix the header',
  });
  const elsewhere = tickets.createTicket({ projectId: app.id, title: 'Other' });
  tickets.addComment(ticket.number, { body: 'Started.', author: 'agent' });
  vi.mocked(appTickets).mockReturnValue(tickets);
  vi.mocked(appConversations).mockReturnValue(world.conversations);
  return { tickets, website, ticket, elsewhere };
}

describe('BoardTicketDrawer', () => {
  beforeEach(() => {
    // Autopilot's answer over whatever Tickets and Conversations a test uses.
    vi.mocked(appAutopilot).mockImplementation(() =>
      createAutopilot({
        tickets: vi.mocked(appTickets)('user'),
        conversations: vi.mocked(appConversations)(),
        changes: createChangeChannel(),
      }),
    );
  });

  it('says under the Status why a Ticket is where it is', async () => {
    const { website, ticket } = setUp();

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: ticket.number,
            cycleId: null,
          })
        }
      </div>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(
      /^In Intake: needs triage\. Auto-triage is off, no Triage ceiling is set\./,
    );
  });

  it('lists the open Batch triage that lists the Ticket among its Conversations (T1319)', async () => {
    const world = createTestConversations();
    const { tickets, conversations } = world;
    const project = tickets.createProject({ name: 'Website' });
    tickets.setProjectAgentSettings(project.id, {
      repositoryPath: world.repositoryDir,
    });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const other = tickets.createTicket({ projectId: project.id, title: 'B' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const closed = await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: cycle.id,
      ticketNumbers: [ticket.number],
    });
    await conversations.close(closed.id);
    await conversations.startBatchTriage({
      projectId: project.id,
      cycleId: null,
      ticketNumbers: [other.number, ticket.number],
    });
    vi.mocked(appTickets).mockReturnValue(tickets);
    vi.mocked(appConversations).mockReturnValue(conversations);
    const drawer = async (number: number) => {
      cleanup();
      renderWithTheme(
        <div>
          {
            await BoardTicketDrawer({
              projectId: project.id,
              number,
              cycleId: null,
            })
          }
        </div>,
      );
      return screen.getByRole('dialog');
    };

    expect(await drawer(ticket.number)).toHaveAttribute(
      'data-conversation-intents',
      'batch_triage',
    );
    expect(await drawer(other.number)).toHaveAttribute(
      'data-conversation-intents',
      'batch_triage',
    );
  });

  it('says nothing for a Done Ticket', async () => {
    const { tickets, website, ticket } = setUp();
    tickets.completeTicket(ticket.number);

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: ticket.number,
            cycleId: null,
          })
        }
      </div>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(/^Ticket drawer/);
  });

  it("renders a Ticket's drawer contents", async () => {
    const { website, ticket } = setUp();

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: ticket.number,
            cycleId: null,
          })
        }
      </div>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Ticket drawer T${ticket.number} comments: Started. activity: created`,
    );
  });

  it("passes the Ticket's Conversations to the drawer", async () => {
    const world = createTestConversations();
    const project = world.tickets.createProject({ name: 'Website' });
    world.tickets.setProjectAgentSettings(project.id, {
      repositoryPath: world.repositoryDir,
    });
    const ticket = world.tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    const started = await world.conversations.start({
      ticketNumber: ticket.number,
      intent: 'start',
      prompt: 'Go',
      startedBy: 'user',
    });
    vi.mocked(appTickets).mockReturnValue(world.tickets);
    vi.mocked(appConversations).mockReturnValue(world.conversations);

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: project.id,
            number: ticket.number,
            cycleId: null,
          })
        }
      </div>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-conversations',
      '1',
    );
    // With their Footprints (T1176): this one recorded no tokens.
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-footprints',
      JSON.stringify({ [started.id]: { measured: false } }),
    );
  });

  it("gives the drawer its Project's Triage and Start commands", async () => {
    const { tickets, website, ticket } = setUp();
    tickets.setProjectAgentCommands(
      website.id,
      agentCommandEntries({
        triageCommand: '/triage',
        startCommand: '/implement',
      }),
    );

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: ticket.number,
            cycleId: null,
          })
        }
      </div>,
    );

    expect(
      JSON.parse(
        screen.getByRole('dialog').getAttribute('data-agent-commands') ?? '',
      ),
    ).toEqual(
      agentCommands({ triageCommand: '/triage', startCommand: '/implement' }),
    );
  });

  it("tells an Epic's drawer the Board below, with its filter and the Epic's children on it", async () => {
    const { tickets, website } = setUp();
    const epic = tickets.createTicket({
      projectId: website.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const planned = tickets.createTicket({
      projectId: website.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });
    tickets.createTicket({
      projectId: website.id,
      title: 'Send the invoice',
      epicNumber: epic.number,
    });
    const cycle = tickets.createCycle({ projectId: website.id, title: 'Beta' });
    tickets.planTicket({ cycleId: cycle.id, number: planned.number });
    const filter = { query: 'pay', labels: [] };

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: epic.number,
            cycleId: cycle.id,
            filter,
          })
        }
      </div>,
    );

    expect(
      JSON.parse(screen.getByRole('dialog').dataset.board ?? 'null'),
    ).toEqual({
      path: `/project/${website.id}/cycle/${cycle.id}`,
      filter,
      onBoard: [planned.number],
    });
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
            cycleId: null,
          })
        }
      </div>,
    );

    expect(
      JSON.parse(screen.getByRole('dialog').dataset.epics ?? 'null'),
    ).toEqual([
      {
        number: epic.number,
        title: 'Checkout',
        color: 'red',
        claim: null,
        hasPullRequest: false,
      },
    ]);
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
              cycleId: null,
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

  it('says a Ticket that does not exist (any more) is not found', async () => {
    const { tickets, website, ticket } = setUp();
    tickets.deleteTicket(ticket.number);

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: ticket.number,
            cycleId: null,
          })
        }
      </div>,
    );

    expect(
      screen.getByText(`Ticket T${ticket.number} not found`),
    ).toBeInTheDocument();
  });

  it("says another Project's Ticket is not found", async () => {
    const { website, elsewhere } = setUp();

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: elsewhere.number,
            cycleId: null,
          })
        }
      </div>,
    );

    expect(
      screen.getByText(`Ticket T${elsewhere.number} not found`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
            cycleId: null,
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

  it("gives an Epic's drawer its children's direct Blockers from outside it", async () => {
    const { tickets, website, elsewhere } = setUp();
    const epic = tickets.createTicket({
      projectId: website.id,
      title: 'Launch',
      type: 'Epic',
    });
    const build = tickets.createTicket({
      projectId: website.id,
      title: 'Build',
      epicNumber: epic.number,
    });
    const ship = tickets.createTicket({
      projectId: website.id,
      title: 'Ship',
      epicNumber: epic.number,
    });
    tickets.addBlocker({ blocker: build.number, blocked: ship.number });
    tickets.addBlocker({ blocker: elsewhere.number, blocked: ship.number });

    renderWithTheme(
      <div>
        {
          await BoardTicketDrawer({
            projectId: website.id,
            number: epic.number,
            cycleId: null,
          })
        }
      </div>,
    );

    expect(
      JSON.parse(
        screen.getByRole('dialog').getAttribute('data-outside-blockers') ?? '',
      ),
    ).toEqual([
      {
        number: elsewhere.number,
        title: 'Other',
        status: 'Todo',
        projectId: elsewhere.projectId,
        blocks: [ship.number],
      },
    ]);
  });
});
