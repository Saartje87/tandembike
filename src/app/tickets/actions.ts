'use server';

import type { EpicChildInput, EpicChildrenInput } from '../../tickets/epics';
import {
  TicketsError,
  type UncheckedCriterion,
  ValidationError,
} from '../../tickets/errors';
import { isStatus, statusRule } from '../../tickets/status';
import type { TicketType } from '../../tickets/ticket-type';
import type {
  AcceptanceCriterionInput,
  BlockerInput,
  MoveTicketsInput,
  ReorderTicketsInput,
  Tickets,
  UpdateTicketInput,
} from '../../tickets/tickets';
import type {
  TriageCategory,
  TriageState,
} from '../../tickets/triage-proposal-state';
import type { ActionResult } from '../lib/action-result';
import { userAction } from '../lib/user-action';

export type CreateTicketResult = ActionResult<{ number: number }>;

/**
 * Creates a Ticket or an Epic in Todo for the UI, under an Epic when
 * `epicNumber` is given; the description defaults to empty.
 * Domain errors come back as `error` (with `fieldErrors` for a validation
 * failure) so the UI can show the module's messages; anything else is a bug
 * and throws.
 */
export async function createTicket(input: {
  projectId: number;
  title: string;
  description?: string;
  /** The Cycle whose tab it was created on, to plan it into. */
  cycleId?: number;
  /** Defaults to a normal Ticket. */
  type?: TicketType;
  /** The Epic whose drawer it was created in, to make it a child of. */
  epicNumber?: number;
}): Promise<CreateTicketResult> {
  return userAction((tickets) => {
    const ticket = tickets.createTicket({
      projectId: Number(input?.projectId),
      title: String(input?.title ?? ''),
      description: String(input?.description ?? ''),
      labels: ['needs-triage'],
      ...(input?.cycleId === undefined
        ? {}
        : { cycleId: Number(input.cycleId) }),
      ...(input?.type === undefined ? {} : { type: input.type }),
      ...(input?.epicNumber === undefined
        ? {}
        : { epicNumber: Number(input.epicNumber) }),
    });
    return { number: ticket.number };
  });
}

export type UpdateTicketResult = ActionResult<{ projectId: number }>;

/**
 * Changes the given fields of a Ticket for the UI, which sends only the
 * fields the User changed. Domain errors come back as `error`, like
 * `createTicket`.
 */
export async function updateTicket(
  input: { number: number } & Omit<
    UpdateTicketInput,
    'addLabels' | 'removeLabels' | 'acceptanceCriteria'
  >,
): Promise<UpdateTicketResult> {
  return userAction((tickets) => {
    const { title, description, status, projectId, color } = input ?? {};
    if (status !== undefined && !isStatus(status)) {
      throw new ValidationError({ status: statusRule });
    }
    const ticket = tickets.updateTicket(Number(input?.number), {
      ...(title === undefined ? {} : { title: String(title) }),
      ...(description === undefined
        ? {}
        : { description: String(description) }),
      ...(status === undefined ? {} : { status }),
      ...(projectId === undefined ? {} : { projectId: Number(projectId) }),
      // The module checks the colour against the palette.
      ...(color === undefined ? {} : { color }),
    });
    // Its card shows on its Board and on the Cycle tab it is planned into.
    return { projectId: ticket.projectId };
  });
}

/**
 * The Merged or Done button's result: `unchecked` when it needs the User to
 * confirm.
 */
export type CompleteTicketResult = ActionResult<{
  projectId: number;
  /** Present when nothing was completed: the criteria to confirm. */
  unchecked?: UncheckedCriterion[];
}>;

/** The override a confirmed Merged or Done records as the User's comment. */
const confirmedFinish =
  'The User confirmed finishing it in the drawer with these criteria unchecked.';

/**
 * Applies the completion rule to a Ticket, or to an Epic and its unarchived
 * children, as the User ("Merged" in Review, or "Done" on a ready-for-human
 * Ticket, in the drawer). There is no MCP tool for it (ADR 0019) and it
 * checks nothing outside the app, such as GitHub. It is
 * never refused for unchecked acceptance criteria (ADR 0043): without
 * `confirmed` it completes nothing and returns them, and with it completes
 * with an override recorded as the User's comment.
 */
export async function completeTicket(input: {
  number: number;
  confirmed?: boolean;
}): Promise<CompleteTicketResult> {
  return userAction((tickets) => {
    const number = Number(input?.number);
    if (input?.confirmed !== true) {
      const unchecked = tickets.uncheckedCriteria(number);
      if (unchecked.length > 0) {
        return { projectId: tickets.getTicket(number).projectId, unchecked };
      }
    }
    const ticket = tickets.completeTicket(
      number,
      input?.confirmed === true ? { override: confirmedFinish } : {},
    );
    return { projectId: ticket.projectId };
  });
}

/**
 * Sends a parked Ticket Back to Todo, as the User: Todo at the end of the
 * Todo order, any Claim released. There is no MCP tool for it (ADR 0019).
 */
export async function backToTodo(input: {
  number: number;
}): Promise<ActionResult<{ projectId: number }>> {
  return userAction((tickets) => {
    const ticket = tickets.backToTodo(Number(input?.number));
    return { projectId: ticket.projectId };
  });
}

/**
 * Saves a complete Status-lane order and refreshes the Board. A stale lane
 * order is refused by the Tickets module so concurrent changes are not lost.
 */
export async function reorderTickets(
  input: ReorderTicketsInput,
): Promise<ActionResult> {
  return userAction((tickets) => {
    if (!isStatus(input?.status)) {
      throw new ValidationError({ status: statusRule });
    }
    if (!Array.isArray(input?.ticketNumbers)) {
      throw new ValidationError({
        ticketNumbers: 'Choose each Ticket in the lane exactly once.',
      });
    }
    if (
      input.ticketNumbers.some(
        (number) => !Number.isSafeInteger(number) || number < 1,
      )
    ) {
      throw new ValidationError({
        ticketNumbers: 'Choose each Ticket in the lane exactly once.',
      });
    }
    const projectId = Number(input?.projectId);
    const cycleId = input.cycleId;
    const reorder: ReorderTicketsInput = {
      projectId,
      status: input.status,
      ticketNumbers: input.ticketNumbers,
      ...(cycleId === undefined
        ? {}
        : { cycleId: cycleId === null ? null : Number(cycleId) }),
    };
    tickets.reorderTickets(reorder);
    return {};
  });
}

/**
 * Moves a selection of Tickets into one Status lane together, all or
 * nothing, and refreshes the Boards. Domain errors come back as `error`,
 * like `createTicket`.
 */
export async function moveTickets(
  input: MoveTicketsInput,
): Promise<ActionResult> {
  return userAction((tickets) => {
    if (!isStatus(input?.status)) {
      throw new ValidationError({ status: statusRule });
    }
    const projectId = Number(input?.projectId);
    tickets.moveTickets({
      projectId,
      ticketNumbers: Array.isArray(input?.ticketNumbers)
        ? input.ticketNumbers.map(Number)
        : [],
      status: input.status,
      before: input.before == null ? null : Number(input.before),
    });
    return {};
  });
}

export type ArchiveTicketResult = ActionResult;

/**
 * Archives or restores a Ticket for the UI and refreshes its Board and
 * drawer. Domain errors come back as `error`, like `createTicket`.
 */
function setArchived(
  input: { number: number; withChildren?: boolean },
  archived: boolean,
): ArchiveTicketResult {
  return userAction((tickets) => {
    const number = Number(input?.number);
    if (archived) {
      tickets.archiveTicket(number, {
        withChildren: input?.withChildren === true,
      });
    } else {
      tickets.restoreTicket(number);
    }
    return {};
  });
}

/** Archives a Ticket for the UI; it can be restored (ADR 0003). */
export async function archiveTicket(input: {
  number: number;
  /** For an Epic: archive its children that are not archived with it. */
  withChildren?: boolean;
}): Promise<ArchiveTicketResult> {
  return setArchived(input, true);
}

/**
 * Archives a selection of Tickets for the UI, all or nothing, and refreshes
 * the Boards. Domain errors come back as `error`, like `createTicket`.
 */
export async function archiveTickets(input: {
  ticketNumbers: number[];
  /** Archive the children of the Epics in it too. */
  withChildren?: boolean;
}): Promise<ArchiveTicketResult> {
  return userAction((tickets) => {
    tickets.archiveTickets(
      Array.isArray(input?.ticketNumbers)
        ? input.ticketNumbers.map(Number)
        : [],
      { withChildren: input?.withChildren === true },
    );
    return {};
  });
}

/**
 * Restores an archived Ticket for the UI, an Epic with the children archived
 * with it.
 */
export async function restoreTicket(input: {
  number: number;
}): Promise<ArchiveTicketResult> {
  return setArchived(input, false);
}

export type DeleteTicketResult = ActionResult;

/**
 * Deletes a Ticket for good as the User (ADR 0012) and refreshes its Boards.
 * The drawer it was deleted from then closes to its Board; a `?ticket=` for
 * a deleted Ticket shows the Board alone (ADR 0013). A refusal comes back
 * as `error`, like `createTicket`.
 */
export async function deleteTicket(input: {
  number: number;
  /** For an Epic: delete its children too, instead of detaching them. */
  withChildren?: boolean;
}): Promise<DeleteTicketResult> {
  return userAction((tickets) => {
    tickets.deleteTicket(Number(input?.number), {
      withChildren: input?.withChildren === true,
    });
    return {};
  });
}

export type TicketLabelResult = ActionResult;

/** Clears a Ticket claim as the User and refreshes its Board and drawer. */
export async function clearTicketClaim(input: {
  number: number;
}): Promise<ActionResult> {
  return userAction((tickets) => {
    tickets.clearTicketClaim(Number(input?.number));
    return {};
  });
}

/**
 * Adds or removes one label for the UI and refreshes the Ticket's Board and
 * drawer. Domain errors come back as `error`, like `createTicket`.
 */
function changeLabel(
  input: { number: number; label: string },
  change: 'add' | 'remove',
): TicketLabelResult {
  return userAction((tickets) => {
    const number = Number(input?.number);
    const labels = [String(input?.label ?? '')];
    if (change === 'add') {
      tickets.addLabels(number, labels);
    } else {
      tickets.removeLabels(number, labels);
    }
    return {};
  });
}

/** Adds a label to a Ticket for the UI. */
export async function addTicketLabel(input: {
  number: number;
  label: string;
}): Promise<TicketLabelResult> {
  return changeLabel(input, 'add');
}

/** Removes a label from a Ticket for the UI. */
export async function removeTicketLabel(input: {
  number: number;
  label: string;
}): Promise<TicketLabelResult> {
  return changeLabel(input, 'remove');
}

export type TicketExternalReferenceResult = ActionResult;

/**
 * Adds or removes one External reference for the UI and refreshes the
 * Ticket's drawer. Domain errors come back as `error`, like `createTicket`.
 */
function changeExternalReference(
  input: { number: number; reference: string },
  change: 'add' | 'remove',
): TicketExternalReferenceResult {
  return userAction((tickets) => {
    const number = Number(input?.number);
    const references = [String(input?.reference ?? '')];
    if (change === 'add') {
      tickets.addExternalReferences(number, references);
    } else {
      tickets.removeExternalReferences(number, references);
    }
    return {};
  });
}

/** Adds an External reference to a Ticket for the UI. */
export async function addTicketExternalReference(input: {
  number: number;
  reference: string;
}): Promise<TicketExternalReferenceResult> {
  return changeExternalReference(input, 'add');
}

/** Removes an External reference from a Ticket for the UI. */
export async function removeTicketExternalReference(input: {
  number: number;
  reference: string;
}): Promise<TicketExternalReferenceResult> {
  return changeExternalReference(input, 'remove');
}

export type TicketCommentResult = ActionResult;

/**
 * Runs a comment change written by the User and refreshes the Ticket's
 * drawer. Domain errors come back as `error`, like `createTicket`.
 */
function changeComment(
  change: (tickets: Tickets) => void,
): TicketCommentResult {
  return userAction((tickets) => {
    change(tickets);
    return {};
  });
}

/** Adds the User's Markdown comment to a Ticket for the UI. */
export async function addTicketComment(input: {
  number: number;
  body: string;
}): Promise<TicketCommentResult> {
  return changeComment((tickets) =>
    tickets.addComment(Number(input?.number), {
      body: String(input?.body ?? ''),
      author: 'user',
    }),
  );
}

/** Edits any comment as the User, for the UI. */
export async function editTicketComment(input: {
  id: number;
  body: string;
}): Promise<TicketCommentResult> {
  return changeComment((tickets) =>
    tickets.editComment(Number(input?.id), {
      body: String(input?.body ?? ''),
      by: 'user',
    }),
  );
}

/** Deletes any comment for good as the User (ADR 0006), for the UI. */
export async function removeTicketComment(input: {
  id: number;
}): Promise<TicketCommentResult> {
  return changeComment((tickets) =>
    tickets.removeComment(Number(input?.id), { by: 'user' }),
  );
}

export type TicketAttachmentResult = ActionResult;

/** Deletes any Attachment for good as the User (ADR 0018), for the UI. */
export async function removeTicketAttachment(input: {
  id: number;
}): Promise<TicketAttachmentResult> {
  return changeComment((tickets) =>
    tickets.removeAttachment(Number(input?.id), { by: 'user' }),
  );
}

export type TicketBlockerResult = ActionResult;

/**
 * Adds or removes a Blocker for the UI and refreshes both Tickets' Boards
 * and drawers. Domain errors come back as `error`, like `createTicket`.
 */
function changeBlocker(
  input: BlockerInput,
  change: 'add' | 'remove',
): TicketBlockerResult {
  return userAction((tickets) => {
    const relationship = {
      blocker: Number(input?.blocker),
      blocked: Number(input?.blocked),
    };
    if (change === 'add') {
      tickets.addBlocker(relationship);
    } else {
      tickets.removeBlocker(relationship);
    }
    return {};
  });
}

/** Makes one Ticket a Blocker of another, for the UI. */
export async function addTicketBlocker(
  input: BlockerInput,
): Promise<TicketBlockerResult> {
  return changeBlocker(input, 'add');
}

/** Stops one Ticket blocking another, for the UI. */
export async function removeTicketBlocker(
  input: BlockerInput,
): Promise<TicketBlockerResult> {
  return changeBlocker(input, 'remove');
}

export type TicketAcceptanceCriteriaResult = ActionResult;

/**
 * Runs an acceptance-criteria change for the UI and refreshes the Ticket's
 * Board, whose cards show progress, and drawer. Domain errors come back as
 * `error`, like `createTicket`.
 */
function changeAcceptanceCriteria(
  change: (tickets: Tickets) => unknown,
): TicketAcceptanceCriteriaResult {
  return userAction((tickets) => {
    change(tickets);
    return {};
  });
}

/**
 * Replaces a Ticket's whole list of acceptance criteria, in order, for the
 * UI: add, edit, remove and reorder. A kept criterion is named by `id`; its
 * checked state stays unless its text changes, which unchecks it.
 */
export async function setTicketAcceptanceCriteria(input: {
  number: number;
  acceptanceCriteria: Omit<AcceptanceCriterionInput, 'checked'>[];
}): Promise<TicketAcceptanceCriteriaResult> {
  return changeAcceptanceCriteria((tickets) => {
    if (!Array.isArray(input?.acceptanceCriteria)) {
      throw new ValidationError({
        acceptanceCriteria: 'Give the acceptance criteria as a list.',
      });
    }
    return tickets.updateTicket(Number(input.number), {
      acceptanceCriteria: input.acceptanceCriteria.map((criterion) => ({
        ...(criterion?.id === undefined ? {} : { id: Number(criterion.id) }),
        text: String(criterion?.text ?? ''),
      })),
    });
  });
}

/** Checks or unchecks one of a Ticket's acceptance criteria for the UI. */
export async function checkTicketAcceptanceCriterion(input: {
  number: number;
  id: number;
  checked: boolean;
}): Promise<TicketAcceptanceCriteriaResult> {
  return changeAcceptanceCriteria((tickets) =>
    tickets.setAcceptanceCriteriaChecked(Number(input?.number), [
      { id: Number(input?.id), checked: Boolean(input?.checked) },
    ]),
  );
}

export type TicketEpicResult = ActionResult;

/**
 * Runs an Epic membership change for the UI and refreshes the Boards, whose
 * cards show it, and both drawers. Domain errors come back as `error`, like
 * `createTicket`.
 */
function changeEpic(change: (tickets: Tickets) => void): TicketEpicResult {
  return userAction((tickets) => {
    change(tickets);
    return {};
  });
}

/**
 * Makes an existing Ticket a child of an Epic for the UI, taking it out of
 * the Epic it is in, if any.
 */
export async function attachTicketToEpic(
  input: EpicChildInput,
): Promise<TicketEpicResult> {
  return changeEpic((tickets) =>
    tickets.moveToEpic({
      epic: Number(input?.epic),
      child: Number(input?.child),
    }),
  );
}

/**
 * Makes several Tickets children of an Epic for the UI, taking each out of
 * the Epic it is in, if any; all or nothing.
 */
export async function moveTicketsToEpic(
  input: EpicChildrenInput,
): Promise<TicketEpicResult> {
  return changeEpic((tickets) =>
    tickets.moveTicketsToEpic({
      epic: Number(input?.epic),
      children: Array.isArray(input?.children)
        ? input.children.map(Number)
        : [],
    }),
  );
}

/** Takes a Ticket out of its Epic, for the UI. */
export async function detachTicketFromEpic(input: {
  number: number;
}): Promise<TicketEpicResult> {
  return changeEpic((tickets) => tickets.detachFromEpic(Number(input?.number)));
}

export type TicketOriginResult = ActionResult;

/**
 * Sets the Ticket a Ticket was split from, or clears it with `null`, for the
 * UI, and refreshes the Boards whose drawers show both sides. Domain errors
 * come back as `error`, like `createTicket`.
 */
export async function setTicketOrigin(input: {
  number: number;
  originNumber: number | null;
}): Promise<TicketOriginResult> {
  return userAction((tickets) => {
    tickets.updateTicket(Number(input?.number), {
      originNumber:
        input?.originNumber === null ? null : Number(input?.originNumber),
    });
    return {};
  });
}

export type TicketAttachmentsResult = ActionResult;

/**
 * Adds the files of a form (`number`, and one `files` entry per file) to a
 * Ticket as the User's Attachments, for the UI. The Tickets module enforces
 * the size and count limits; at the first refusal the files before it stay
 * added and the rest are dropped; the refusal names that file and counts the
 * earlier ones. Domain errors come back as `error`, like
 * `createTicket`.
 */
export async function addTicketAttachments(
  form: FormData,
): Promise<TicketAttachmentsResult> {
  const number = Number(form?.get('number'));
  const files = (form?.getAll('files') ?? []).filter(
    (entry): entry is File => typeof entry !== 'string',
  );
  const uploads = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      // Browsers may add parameters such as a charset; the module wants the bare type.
      mediaType: file.type.split(';')[0],
      content: new Uint8Array(await file.arrayBuffer()),
    })),
  );
  return userAction((tickets) => {
    if (uploads.length === 0) {
      throw new ValidationError({ files: 'Choose a file to add.' });
    }
    let added = 0;
    for (const upload of uploads) {
      try {
        tickets.addAttachment(number, { ...upload, author: 'user' });
      } catch (error) {
        if (!(error instanceof TicketsError)) {
          throw error;
        }
        // Name the file and what already went in, as the User chose several.
        const earlier =
          added === 0
            ? ''
            : ` ${added} earlier ${added === 1 ? 'file was' : 'files were'} added.`;
        throw new TicketsError(
          `"${upload.name}" was not added: ${error.message}${earlier}`,
        );
      }
      added += 1;
    }
    return {};
  });
}

/**
 * Approves a pending triage proposal as the User, with the category and
 * state they chose. There is no MCP tool for it: only the User applies a
 * proposal.
 */
export async function approveTriage(input: {
  id: number;
  category?: TriageCategory;
  state?: TriageState;
}): Promise<ActionResult> {
  return userAction((tickets) => {
    tickets.approveTriage(Number(input?.id), {
      ...(input?.category === undefined ? {} : { category: input.category }),
      ...(input?.state === undefined ? {} : { state: input.state }),
    });
    return {};
  });
}

/** Rejects a pending triage proposal as the User, with an optional reason. */
export async function rejectTriage(input: {
  id: number;
  reason?: string;
}): Promise<ActionResult> {
  return userAction((tickets) => {
    tickets.rejectTriage(
      Number(input?.id),
      input?.reason === undefined ? undefined : String(input.reason),
    );
    return {};
  });
}
