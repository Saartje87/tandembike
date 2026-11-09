import { z } from 'zod';

import {
  commentBody,
  criterionId,
  detail,
  externalReference,
  projectId,
  requireRunId,
  respond,
  respondTicket,
  returnsSummary,
  type ToolContext,
  ticketNumber,
} from './tool-shared';

const runIdField = z
  .string()
  .optional()
  .describe(
    "This Agent run's unique ID. Runs Tandembike started, and `tandembike start` sessions, need not pass it; in another terminal session pass one of your own.",
  );

export const registerWorkTools = ({
  tickets,
  runId,
  resolveProjectId,
  registerTool,
}: ToolContext): void => {
  registerTool(
    'next_work',
    {
      title: 'Next work',
      description: `Find the top item to work next in your Project's Active Cycle, in Board order: Todo, labelled ready-for-agent, unblocked, unclaimed, not archived, not an Epic's child, and an Epic only once it has a child. Returns { ticket } with the whole Ticket, or { ticket: null, reason } where reason is "no-active-cycle", "nothing-ready" or "all-blocked-or-claimed": tell the User. It does not see Conversations, so an item with an open Start Conversation may still be returned. Then call start_work with its number. The Project defaults to your folder's.`,
      inputSchema: {
        projectId: projectId
          .optional()
          .describe('The Project (id from get_project).'),
        projectName: z
          .string()
          .optional()
          .describe(
            'The name of the Project, ignoring case, in place of projectId.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    ({ projectId, projectName }) =>
      respond(() =>
        tickets.nextWork({
          projectId: resolveProjectId({ projectId, projectName }),
        }),
      ),
  );

  registerTool(
    'start_work',
    {
      title: 'Start work',
      description:
        "Begin a Ticket or an Epic: claim it for this Agent run and, for a Todo Ticket, move it to In progress (an Epic's Status follows its children; an In progress Ticket is only claimed; a child under your own Epic Claim moves to In progress). Refused naming the holder when another run holds the Claim, and naming the unresolved Blockers when the Ticket is blocked. Returns the bundle you need to begin: { ticket (description, acceptance criteria, labels, External references, Epic link), comments, blockers (with Statuses), epic (null, or the Epic with its children's Statuses and Blockers and nextChild, the next child to work in Blocker order), cycle, checkCommand (what must pass before a PR, or null) }.",
      inputSchema: { number: ticketNumber, agentRunId: runIdField },
      annotations: { idempotentHint: true },
    },
    ({ number, agentRunId }) =>
      respond(() => tickets.startWork(number, requireRunId(agentRunId, runId))),
  );

  registerTool(
    'add_note',
    {
      title: 'Add note',
      description:
        'Add a Markdown comment to a Ticket, written by you as an Agent, to share progress, findings or a decision without editing the description. Returns the comment.',
      inputSchema: { number: ticketNumber, body: commentBody },
    },
    ({ number, body }) =>
      respond(() => tickets.addComment(number, { body, author: 'agent' })),
  );

  registerTool(
    'check_criterion',
    {
      title: 'Check criterion',
      description: `Check or uncheck some of a Ticket's acceptance criteria by id as you verify them. Its other criteria, their order and Status stay as they are. ${returnsSummary({ extra: 'acceptanceCriteria holding only the criteria named in the call' })}`,
      inputSchema: {
        number: ticketNumber,
        ids: z
          .array(criterionId)
          .describe('The criteria to change, each once, at least one.'),
        checked: z
          .boolean()
          .describe('true when they are met, false to uncheck them.'),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, ids, checked, detail }) =>
      respondTicket(
        detail,
        () =>
          tickets.setAcceptanceCriteriaChecked(
            number,
            ids.map((id) => ({ id, checked })),
          ),
        ({ acceptanceCriteria }) => ({
          acceptanceCriteria: acceptanceCriteria.filter(({ id }) =>
            ids.includes(id),
          ),
        }),
      ),
  );

  registerTool(
    'open_pr',
    {
      title: 'Open PR',
      description: `Link the pull request you opened to a Ticket by adding its URL as an External reference. With handOff: true it also releases your Claim, so the Ticket lands in Review for the User; use it when you stop at an open PR. ${returnsSummary({ extra: 'externalReferences and its claim' })}`,
      inputSchema: {
        number: ticketNumber,
        url: externalReference.describe('The URL of the pull request.'),
        handOff: z
          .boolean()
          .optional()
          .describe('true to also release your Claim. Defaults to false.'),
        agentRunId: runIdField,
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, url, handOff, agentRunId, detail }) =>
      respondTicket(
        detail,
        () =>
          tickets.linkPullRequest(
            number,
            url,
            handOff ? requireRunId(agentRunId, runId) : undefined,
          ),
        ({ externalReferences, claim }) => ({ externalReferences, claim }),
      ),
  );

  registerTool(
    'finish_work',
    {
      title: 'Finish work',
      description: `Finish a Ticket or an Epic by the completion rule, as the User's Merged button does: Done, its triage state label removed (never wontfix or a category label) and its Claim released. For an Epic, every child that is not archived is finished the same way, all or nothing. Before calling it, check that the PR is merged with CI green and the acceptance criteria are checked: the tool checks none of this. ${returnsSummary()}`,
      inputSchema: { number: ticketNumber, detail },
      annotations: { idempotentHint: true },
    },
    ({ number, detail }) =>
      respondTicket(detail, () => tickets.completeTicket(number)),
  );

  registerTool(
    'abandon_work',
    {
      title: 'Abandon work',
      description: `Give up a Ticket: comment your reason, release your Claim and, if it is In progress with no PR among its External references, move it back to Todo so it is not left Stalled. With a PR it stays In progress. Refused when another run holds the Claim. ${returnsSummary({ extra: 'its claim, now null' })}`,
      inputSchema: {
        number: ticketNumber,
        reason: commentBody.describe(
          'Why you stopped, in Markdown. It becomes a comment on the Ticket.',
        ),
        agentRunId: runIdField,
        detail,
      },
    },
    ({ number, reason, agentRunId, detail }) =>
      respondTicket(
        detail,
        () =>
          tickets.abandonWork(number, requireRunId(agentRunId, runId), reason),
        ({ claim }) => ({ claim }),
      ),
  );
};
