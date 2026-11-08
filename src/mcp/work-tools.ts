import { z } from 'zod';

import {
  commentBody,
  commentId,
  criterionId,
  detail,
  requireRunId,
  respond,
  respondTicket,
  returnsSummary,
  type ToolContext,
  ticketNumber,
} from './tool-shared';

export const registerWorkTools = ({
  tickets,
  runId,
  registerTool,
}: ToolContext): void => {
  registerTool(
    'claim_ticket',
    {
      title: 'Claim Ticket',
      description: `Atomically claim a Ticket for one Agent run. A repeated claim by the same Agent run succeeds; another run cannot take an existing claim and is told who holds it. Claiming an Epic covers its children: no other run can claim them meanwhile, and an Epic is refused while another run holds a child, or once it is Done. ${returnsSummary({ extra: 'its claim' })}`,
      inputSchema: {
        number: ticketNumber,
        agentRunId: z
          .string()
          .optional()
          .describe(
            'A unique identifier for this Agent run. Runs Tandembike started need not pass it.',
          ),
        agentName: z
          .string()
          .optional()
          .describe(
            'An optional display name for the Agent holding the claim.',
          ),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, agentRunId, agentName, detail }) =>
      respondTicket(
        detail,
        () =>
          tickets.claimTicket(number, {
            agentRunId: requireRunId(agentRunId, runId),
            agentName,
          }),
        ({ claim }) => ({ claim }),
      ),
  );

  registerTool(
    'release_ticket_claim',
    {
      title: 'Release Ticket claim',
      description: `Release a Ticket claim held by this Agent run. A different Agent run cannot release another run's claim. Releasing an In progress Ticket with no PR reference in its External references leaves it stalled in Action needed on the Board, so when abandoning the work, also move it back to Todo or say why in a comment. Releasing an Epic's claim with no PR reference leaves its In progress children stalled too, as they run on the Epic's claim. ${returnsSummary({ extra: 'its claim, now null' })}`,
      inputSchema: {
        number: ticketNumber,
        agentRunId: z
          .string()
          .optional()
          .describe(
            'The unique identifier used when claiming this Ticket. Runs Tandembike started need not pass it.',
          ),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, agentRunId, detail }) =>
      respondTicket(
        detail,
        () =>
          tickets.releaseTicketClaim(number, {
            agentRunId: requireRunId(agentRunId, runId),
          }),
        ({ claim }) => ({ claim }),
      ),
  );

  registerTool(
    'complete_ticket',
    {
      title: 'Complete Ticket',
      description: `Finish a Ticket or an Epic by the completion rule, as the User's Merged button in the Ticket drawer does: its Status becomes Done, its triage state label is removed (never wontfix or a category label) and its Claim is released. For an Epic, every child that is not archived is completed the same way, all or nothing, and the Epic loses its own triage state label; its Status follows its children. Before calling it, check that the work's PR is merged with CI green and that its acceptance criteria are checked: the tool checks none of this, and completes a Ticket whatever its Status. ${returnsSummary()}`,
      inputSchema: { number: ticketNumber, detail },
      annotations: { idempotentHint: true },
    },
    ({ number, detail }) =>
      respondTicket(detail, () => tickets.completeTicket(number)),
  );

  registerTool(
    'set_acceptance_criteria_checked',
    {
      title: 'Check acceptance criteria',
      description: `Check or uncheck some of a Ticket's acceptance criteria by id. Its other criteria, their order and the Ticket's Status stay as they are. ${returnsSummary({ extra: 'acceptanceCriteria holding only the criteria named in the call' })}`,
      inputSchema: {
        number: ticketNumber,
        criteria: z
          .array(
            z.strictObject({
              id: criterionId,
              checked: z
                .boolean()
                .describe('true when the criterion is met, false when not.'),
            }),
          )
          .describe('The criteria to change, each once, at least one.'),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, criteria, detail }) =>
      respondTicket(
        detail,
        () => tickets.setAcceptanceCriteriaChecked(number, criteria),
        ({ acceptanceCriteria }) => ({
          acceptanceCriteria: acceptanceCriteria.filter(({ id }) =>
            criteria.some((criterion) => criterion.id === id),
          ),
        }),
      ),
  );

  registerTool(
    'list_comments',
    {
      title: 'List comments',
      description:
        'List a Ticket\'s comments, oldest first. Each has its id, author ("user" for the User, "agent" for an Agent), Markdown body, createdAt and editedAt (null until edited).',
      inputSchema: { number: ticketNumber },
      annotations: { readOnlyHint: true },
    },
    ({ number }) => respond(() => tickets.listComments(number)),
  );

  registerTool(
    'add_comment',
    {
      title: 'Add comment',
      description:
        'Add a Markdown comment to a Ticket, written by you as an Agent, and return it. Use comments to share progress and context without overwriting the description.',
      inputSchema: { number: ticketNumber, body: commentBody },
    },
    ({ number, body }) =>
      respond(() => tickets.addComment(number, { body, author: 'agent' })),
  );

  registerTool(
    'edit_comment',
    {
      title: 'Edit comment',
      description:
        "Replace a comment's body and return it with its editedAt time. Agents can only edit comments written by an Agent, not the User's.",
      inputSchema: { id: commentId, body: commentBody },
    },
    ({ id, body }) =>
      respond(() => tickets.editComment(id, { body, by: 'agent' })),
  );

  registerTool(
    'remove_comment',
    {
      title: 'Remove comment',
      description:
        "Delete a comment permanently; it cannot be restored. Agents can only remove comments written by an Agent, not the User's.",
      inputSchema: { id: commentId },
      annotations: { destructiveHint: true },
    },
    ({ id }) =>
      respond(() => {
        tickets.removeComment(id, { by: 'agent' });
        return { removed: id };
      }),
  );

  registerTool(
    'list_activity',
    {
      title: 'List Activity',
      description:
        'List a Ticket\'s whole Activity, oldest first: one entry per action that changed it, archived Tickets included. Each has its id, actor ("user" for the User, "agent" for an Agent), createdAt and changes, each with its type and its old and new values (from, to), or the label, Ticket number or criterion text it names; Claim entries carry the agentRunId and agentName. Comments are not in it: list_comments lists them.',
      inputSchema: { number: ticketNumber },
      annotations: { readOnlyHint: true },
    },
    ({ number }) =>
      respond(() =>
        tickets
          .listActivity(number)
          .map(({ id, actor, createdAt, changes }) => ({
            id,
            actor,
            createdAt,
            changes,
          })),
      ),
  );
};
