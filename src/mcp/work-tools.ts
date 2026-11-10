import { z } from 'zod';

import {
  triageCategories,
  triageStates,
} from '../tickets/triage-proposal-state';
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
      description: `Begin a Ticket or an Epic: claim it for this Agent run and, for a Todo Ticket, move it to In progress (an Epic's Status follows its children; an In progress Ticket is only claimed; a child under your own Epic Claim moves to In progress). Refused naming the holder when another run holds the Claim, and naming the unresolved Blockers when the Ticket is blocked (under your own Epic Claim, an In progress sibling is not one). Returns the bundle you need to begin: { ticket (description, acceptance criteria, labels, External references, Epic link), comments, blockers (with Statuses), epic (null, or the Epic with its children's Statuses, Blockers and uncheckedCriteria counts and nextChild, the next Todo child to work in Blocker order), cycle, checkCommand (what must pass before a PR, or null), merge ("auto": merge your own PR once the Check command, your review, every acceptance criterion and CI pass, then finish_work, else add_note why and hand off; "approve": hand off with open_pr and handOff: true for the User to approve the merge) }. merge is the Project's Auto-merge setting when the Claim was taken, which only the User sets.`,
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
    'propose_triage',
    {
      title: 'Propose triage',
      description: `End a Triage run: propose a category and a state for a Todo Ticket, with your reasoning. The reasoning is posted as the Ticket's triage comment, starting with the AI disclaimer, so do not also call add_note. Nothing is applied: the User approves or rejects the proposal in the Ticket drawer, and only an approval sets the labels and replaces the acceptance criteria (when you give some). A newer proposal replaces a pending one. Refused for a Ticket that is not Todo. Returns the proposal.`,
      inputSchema: {
        number: ticketNumber,
        category: z.enum(triageCategories).describe('bug or enhancement.'),
        state: z
          .enum(triageStates)
          .describe(
            'The state you recommend: ready-for-agent, ready-for-human, needs-info or wontfix.',
          ),
        reasoning: commentBody.describe(
          'Why, in Markdown: what you checked and found. It becomes the triage comment.',
        ),
        acceptanceCriteria: z
          .array(z.string())
          .optional()
          .describe(
            "Proposed acceptance criteria, one line each. On approval they replace the Ticket's; leave out to keep its own.",
          ),
        duplicateOf: ticketNumber
          .optional()
          .describe(
            'The Ticket this one duplicates. On approval it is commented "Duplicate of T#", labelled wontfix and archived. Not with splits, and not itself.',
          ),
        splits: z
          .array(
            z.strictObject({
              title: z.string(),
              description: z.string(),
              acceptanceCriteria: z.array(z.string()),
            }),
          )
          .optional()
          .describe(
            'Tickets to split this one into. On approval they are filed with this Ticket as Origin, in its Cycle, with the approved category and state, and this Ticket is archived. Not with duplicateOf, and not for an Epic.',
          ),
      },
    },
    ({ number, ...proposal }) =>
      respond(() =>
        tickets.proposeTriage(number, {
          ...proposal,
          ...(runId === undefined ? {} : { runId }),
        }),
      ),
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
      description: `Finish a Ticket or an Epic by the completion rule, as the User's Merged button does: Done, its triage state label removed (never wontfix or a category label) and its Claim released. For an Epic, every child that is not archived is finished the same way, all or nothing. It is how an Agent moves any work to Done, with a PR or without a PR (a split spec, ready-for-human or research work), not update_ticket. Refused while any acceptance criterion is unchecked: the Ticket's own or, for an Epic, the Epic's and every unarchived child's; the refusal names each with its Ticket. To finish anyway, pass an override reason: it is posted as your comment naming the unchecked criteria. It checks nothing on GitHub: first check that the PR is merged with CI green. ${returnsSummary()}`,
      inputSchema: {
        number: ticketNumber,
        override: z
          .string()
          .optional()
          .describe(
            'Why you finish with acceptance criteria unchecked, in Markdown. Posted as a comment naming them. Leave out unless the refusal named criteria you deliberately left unmet.',
          ),
        detail,
      },
      annotations: { idempotentHint: true },
    },
    ({ number, override, detail }) =>
      respondTicket(detail, () =>
        tickets.completeTicket(
          number,
          override === undefined ? {} : { override },
        ),
      ),
  );

  registerTool(
    'abandon_work',
    {
      title: 'Abandon work',
      description: `Give up a Ticket: comment your reason, release your Claim and, if it is In progress with no PR among its External references, move it back to Todo so it is not left Stalled. With a PR, or when the Ticket is archived, its Status stays as it is. Refused when another run holds the Claim. ${returnsSummary({ extra: 'its claim, now null' })}`,
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
