import {
  and,
  count,
  countDistinct,
  eq,
  inArray,
  isNotNull,
  ne,
} from 'drizzle-orm';

import type { DatabaseConnection } from '../db/connection';
import {
  ticketAcceptanceCriteria,
  ticketBlockers,
  ticketLabels,
  tickets,
} from '../db/schema';
import { planNewTicket } from './cycles';
import { checkEpicChild } from './epics';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import {
  checkNewExternalReferences,
  insertExternalReferences,
  normalizeExternalReferences,
} from './external-references';
import {
  duplicateSimilarity,
  feedbackLabels,
  isFeedback,
  jaccardSimilarity,
  maxFeedbackPerRun,
} from './feedback';
import { checkOrigin } from './origins';
import {
  isPaletteColor,
  type PaletteColor,
  paletteColors,
  paletteRule,
} from './palette';
import { nextPosition } from './positions';
import { checkTitle, maxBatchSize, throwFieldErrors } from './rules';
import type { TicketRowContext } from './ticket-row-context';
import {
  checkAcceptanceCriteria,
  checkDescription,
  checkLabels,
  checkStatus,
  normalizeLabels,
} from './ticket-rules';
import { isTicketType, type TicketType } from './ticket-type';
import type {
  BatchTicketInput,
  CreateTicketBatchInput,
  CreateTicketInput,
  Ticket,
} from './tickets';

/**
 * The cleaned-up fields of a new Ticket, or a `ValidationError` with a
 * reason for every field that breaks the rules.
 */
function checkNewTicket(input: Omit<CreateTicketInput, 'projectId'>) {
  const title = input.title.trim();
  const description = input.description ?? '';
  const status = input.status ?? 'Todo';
  const type = input.type ?? 'Ticket';
  const labels = normalizeLabels(input.labels ?? []);
  const externalReferences = normalizeExternalReferences(
    input.externalReferences ?? [],
  );
  const acceptanceCriteria = (input.acceptanceCriteria ?? []).map(
    ({ text, checked }) => ({ text: text.trim(), checked: checked ?? false }),
  );

  throwFieldErrors({
    title: checkTitle(title),
    description: checkDescription(description),
    status:
      checkStatus(status) ??
      (type === 'Epic' && status !== 'Todo'
        ? "An Epic's Status follows its child Tickets. Leave the Status out."
        : undefined),
    type: isTicketType(type) ? undefined : 'Choose a type: Ticket or Epic.',
    color:
      input.color === undefined
        ? undefined
        : !isPaletteColor(input.color)
          ? paletteRule
          : type === 'Epic'
            ? undefined
            : 'Only an Epic has a colour. Leave the colour out.',
    labels: checkLabels(labels),
    externalReferences: checkNewExternalReferences(externalReferences),
    acceptanceCriteria: checkAcceptanceCriteria(
      acceptanceCriteria.map(({ text }) => text),
    ),
  });
  return {
    values: { title, description, status, type, color: input.color },
    labels,
    externalReferences,
    acceptanceCriteria,
  };
}

type CheckedNewTicket = ReturnType<typeof checkNewTicket>;

/**
 * The checked fields and Blocker positions of the batch's Ticket at
 * `position`, or a `ValidationError` naming it by position: each field is
 * keyed `tickets[2].title`, and each reason starts with the position.
 */
function checkBatchTicket(
  batchTicket: BatchTicketInput,
  position: number,
  batchSize: number,
): {
  ticket: CheckedNewTicket;
  blockedByPositions: number[];
  blockedByNumbers: number[];
} {
  const reasons: Record<string, string | undefined> = {};
  const reasonAt = (field: string, reason: string | undefined) => {
    reasons[`tickets[${position}].${field}`] =
      reason === undefined
        ? undefined
        : `Ticket at position ${position}: ${reason}`;
  };
  const {
    blockedByPositions = [],
    blockedByNumbers = [],
    epicPosition: _epicPosition,
    originPosition: _originPosition,
    originNumber: _originNumber,
    ...input
  } = batchTicket;
  // Until the numbers exist, a placeholder stands in as a one-digit number, so
  // that a limit is checked against roughly the stored text; the text is
  // checked again with the real numbers.
  const standIn = fillPlaceholders(input, () => 'T0');
  reasonAt('title', outsidePositions(input.title, batchSize));
  reasonAt('description', outsidePositions(input.description, batchSize));
  reasonAt(
    'acceptanceCriteria',
    outsidePositions(
      (input.acceptanceCriteria ?? []).map(({ text }) => text).join('\n'),
      batchSize,
    ),
  );
  let ticket: CheckedNewTicket | undefined;
  try {
    ticket = checkNewTicket(standIn);
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      throw error;
    }
    for (const [field, reason] of Object.entries(error.fieldErrors)) {
      reasonAt(field, reason);
    }
  }
  reasonAt(
    'blockedByPositions',
    checkBlockedByPositions(blockedByPositions, position),
  );
  reasonAt(
    'blockedByNumbers',
    new Set(blockedByNumbers).size === blockedByNumbers.length
      ? undefined
      : 'name each Ticket in blockedByNumbers once.',
  );
  throwFieldErrors(reasons);
  // Without a ValidationError, `checkNewTicket` returned.
  return {
    ticket: ticket as CheckedNewTicket,
    blockedByPositions,
    blockedByNumbers,
  };
}

/** Why `field` cannot name a position other than an earlier one. */
function earlierOnly(field: string, position: number): string {
  return position === 0
    ? `${field} can only name an earlier position, and it is first.`
    : `${field} can only name an earlier position, from 0 to ${position - 1}.`;
}

/**
 * Refuses the batch, naming each Ticket by position, when its `epicPosition`
 * `originPosition` or `originNumber` breaks the rules: only an earlier
 * position, an Epic of the batch as the Epic, no Epic with an Epic, no
 * position field next to the matching batch-level field, and a Ticket's own
 * `originNumber` with neither `originPosition` nor the batch `originNumber`.
 */
function checkBatchLinks(
  batch: CreateTicketBatchInput,
  types: readonly TicketType[],
) {
  const reasons: Record<string, string | undefined> = {};
  batch.tickets.forEach((ticket, position) => {
    const reasonAt = (field: string, reason: string | undefined) => {
      reasons[`tickets[${position}].${field}`] =
        reason === undefined
          ? undefined
          : `Ticket at position ${position}: ${reason}`;
    };
    const earlier = (at: number) =>
      Number.isInteger(at) && at >= 0 && at < position;
    const { epicPosition, originPosition, originNumber } = ticket;
    if (epicPosition !== undefined) {
      reasonAt(
        'epicPosition',
        batch.epicNumber !== undefined
          ? 'give epicPosition or the batch epicNumber, not both.'
          : types[position] === 'Epic'
            ? 'an Epic cannot be a child of another Epic. Leave epicPosition out.'
            : !earlier(epicPosition)
              ? earlierOnly('epicPosition', position)
              : types[epicPosition] !== 'Epic'
                ? `epicPosition names position ${epicPosition}, which is not created as an Epic. Give it type "Epic".`
                : undefined,
      );
    } else if (batch.epicNumber !== undefined && types[position] === 'Epic') {
      reasonAt(
        'epicNumber',
        'an Epic cannot be a child of another Epic, so the batch epicNumber cannot apply to it.',
      );
    }
    if (originPosition !== undefined) {
      reasonAt(
        'originPosition',
        batch.originNumber !== undefined
          ? 'give originPosition or the batch originNumber, not both.'
          : !earlier(originPosition)
            ? earlierOnly('originPosition', position)
            : undefined,
      );
    }
    if (originNumber !== undefined) {
      reasonAt(
        'originNumber',
        originPosition !== undefined
          ? 'give originNumber or originPosition, not both.'
          : batch.originNumber !== undefined
            ? "give the Ticket's originNumber or the batch originNumber, not both."
            : undefined,
      );
    }
  });
  throwFieldErrors(reasons);
}

/** A fresh global regex per use, so no `lastIndex` is shared. */
const placeholders = () => /\{\{T:(\d+)\}\}/g;

/** Why a `{{T:n}}` in `text` names a position outside the batch, if one does. */
function outsidePositions(
  text: string | undefined,
  batchSize: number,
): string | undefined {
  for (const [found, position] of text?.matchAll(placeholders()) ?? []) {
    if (Number(position) >= batchSize) {
      return `${found} names a position outside the batch; use positions 0 to ${batchSize - 1}.`;
    }
  }
  return undefined;
}

/**
 * `input` with every `{{T:n}}` in its title, description and criteria text
 * replaced by `replacement(n)`.
 */
function fillPlaceholders<
  T extends Pick<
    BatchTicketInput,
    'title' | 'description' | 'acceptanceCriteria'
  >,
>(input: T, replacement: (position: number) => string): T {
  const fill = (text: string) =>
    text.replace(placeholders(), (_, position) =>
      replacement(Number(position)),
    );
  return {
    ...input,
    title: fill(input.title),
    ...(input.description === undefined
      ? {}
      : { description: fill(input.description) }),
    ...(input.acceptanceCriteria === undefined
      ? {}
      : {
          acceptanceCriteria: input.acceptanceCriteria.map((criterion) => ({
            ...criterion,
            text: fill(criterion.text),
          })),
        }),
  };
}

/**
 * Runs `check` for the batch's Ticket at `position`, naming it in a refusal:
 * a `ValidationError` is keyed `tickets[2].<field>`, and every reason starts
 * with the position.
 */
function atPosition(position: number, field: string, check: () => void) {
  const at = (reason: string) => `Ticket at position ${position}: ${reason}`;
  try {
    check();
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ValidationError({
        [`tickets[${position}].${field}`]: at(
          Object.values(error.fieldErrors).join(' '),
        ),
      });
    }
    if (error instanceof NotFoundError) {
      throw new NotFoundError(at(error.message));
    }
    throw error;
  }
}

/** Why a batch Ticket's Blocker positions break the rules, if they do. */
function checkBlockedByPositions(
  positions: readonly number[],
  position: number,
): string | undefined {
  if (positions.length === 0) {
    return undefined;
  }
  if (position === 0) {
    return 'blockedByPositions can only name earlier positions, and it is first.';
  }
  if (
    positions.some(
      (blocker) =>
        !Number.isInteger(blocker) || blocker < 0 || blocker >= position,
    )
  ) {
    return `blockedByPositions can only name earlier positions, from 0 to ${position - 1}.`;
  }
  if (new Set(positions).size !== positions.length) {
    return 'name each position in blockedByPositions once.';
  }
  return undefined;
}

/**
 * Refuses a batch whose feedback Tickets (T1250) would take `filedByRun`
 * past the cap, or whose titles nearly repeat a live feedback Ticket of the
 * Project. Tickets without a source label are never checked.
 */
function checkFeedback(
  db: DatabaseConnection,
  projectId: number,
  filedByRun: string | undefined,
  batch: readonly CheckedNewTicket[],
) {
  const feedback = batch.flatMap(({ values, labels }, position) =>
    isFeedback(labels) ? [{ position, title: values.title }] : [],
  );
  if (feedback.length === 0) {
    return;
  }
  if (filedByRun !== undefined) {
    const { filed } = db
      .select({ filed: countDistinct(tickets.number) })
      .from(tickets)
      .innerJoin(ticketLabels, eq(ticketLabels.ticketNumber, tickets.number))
      .where(
        and(
          eq(tickets.filedByRun, filedByRun),
          inArray(ticketLabels.label, [...feedbackLabels]),
        ),
      )
      .get() as { filed: number };
    if (filed + feedback.length > maxFeedbackPerRun) {
      throw new NotAllowedError(
        `This run has filed ${Math.min(filed, maxFeedbackPerRun)} feedback Tickets already; add a note to one of them with add_note instead.`,
      );
    }
  }
  const live = db
    .selectDistinct({ number: tickets.number, title: tickets.title })
    .from(tickets)
    .innerJoin(ticketLabels, eq(ticketLabels.ticketNumber, tickets.number))
    .where(
      and(
        eq(tickets.projectId, projectId),
        eq(tickets.archived, false),
        ne(tickets.status, 'Done'),
        inArray(ticketLabels.label, [...feedbackLabels]),
      ),
    )
    .all();
  const reasons: Record<string, string> = {};
  for (const [index, { position, title }] of feedback.entries()) {
    const match = live.find(
      (other) => jaccardSimilarity(title, other.title) >= duplicateSimilarity,
    );
    if (match) {
      reasons[`tickets[${position}].title`] =
        `Ticket at position ${position}: its title nearly repeats feedback Ticket T${match.number} ("${match.title}"). Add a note to T${match.number} with add_note instead.`;
      continue;
    }
    const earlier = feedback
      .slice(0, index)
      .find(
        (other) => jaccardSimilarity(title, other.title) >= duplicateSimilarity,
      );
    if (earlier) {
      reasons[`tickets[${position}].title`] =
        `Ticket at position ${position}: its title nearly repeats the feedback Ticket at position ${earlier.position} of this batch ("${earlier.title}"). File it once.`;
    }
  }
  throwFieldErrors(reasons);
}

/**
 * Inserts a checked new Ticket at the end of its Status lane, with its
 * labels and acceptance criteria and its `created` Activity entry by
 * `actor`, and returns its number. Run it in a transaction.
 */
function insertTicket(
  {
    db,
    insertLabels,
    insertAcceptanceCriteria,
    recordActivity,
  }: TicketRowContext,
  { values, labels, externalReferences, acceptanceCriteria }: CheckedNewTicket,
  row: {
    projectId: number;
    epicNumber: number | null;
    originNumber: number | null;
    createdAt: Date;
    filedByRun?: string;
  },
): number {
  const { number } = db
    .insert(tickets)
    .values({
      ...values,
      color:
        values.type === 'Epic'
          ? (values.color ?? leastUsedColor(db, row.projectId))
          : null,
      ...row,
      filedByRun: row.filedByRun ?? null,
      position: nextPosition(db, row.projectId, values.status),
      updatedAt: row.createdAt,
    })
    .returning({ number: tickets.number })
    .get();
  insertLabels(number, labels);
  insertExternalReferences(db, number, externalReferences);
  insertAcceptanceCriteria(number, acceptanceCriteria);
  recordActivity(number, [{ type: 'created' }]);
  return number;
}

/**
 * The palette colour fewest live Epics in Project `projectId` use, the
 * earliest in the palette on a tie, for a new Epic.
 */
function leastUsedColor(
  db: DatabaseConnection,
  projectId: number,
): PaletteColor {
  const uses = new Map(
    db
      .select({ color: tickets.color, uses: count() })
      .from(tickets)
      .where(
        and(
          eq(tickets.projectId, projectId),
          eq(tickets.type, 'Epic'),
          eq(tickets.archived, false),
          isNotNull(tickets.color),
        ),
      )
      .groupBy(tickets.color)
      .all()
      .map(({ color, uses }) => [color, uses]),
  );
  return paletteColors.reduce((least, color) =>
    (uses.get(color) ?? 0) < (uses.get(least) ?? 0) ? color : least,
  );
}

/**
 * The create area of the Tickets module: one Ticket, or a batch with its
 * Blockers, Epic and Origin links by position.
 */
export function createTicketCreation(ctx: TicketRowContext) {
  const {
    db,
    changes,
    getTicket,
    publishWith,
    checkBlocker,
    recordActivity,
    touchTicket,
    syncEpicStatus,
    checkProjectWritable,
  } = ctx;
  return {
    createTicket(input: CreateTicketInput): Ticket {
      const checked = checkNewTicket(input);
      const { values } = checked;
      checkProjectWritable(input.projectId);
      const project = { id: input.projectId };

      // better-sqlite3 runs every statement on this one connection, so
      // statements on `db` inside the callback are part of the transaction.
      const number = db.transaction(() => {
        if (input.epicNumber !== undefined) {
          checkEpicChild(db, input.epicNumber, {
            type: values.type,
            projectId: project.id,
          });
        }
        if (input.originNumber !== undefined) {
          checkOrigin(db, input.originNumber);
        }
        const number = insertTicket(ctx, checked, {
          projectId: project.id,
          epicNumber: input.epicNumber ?? null,
          originNumber: input.originNumber ?? null,
          createdAt: new Date(),
        });
        if (input.cycleId !== undefined) {
          planNewTicket(db, { cycleId: input.cycleId, number }, project.id);
        }
        if (input.originNumber !== undefined) {
          touchTicket(input.originNumber);
        }
        syncEpicStatus(input.epicNumber ?? null);
        return number;
      });
      // A child changes its Epic's children, and maybe its Status; a split-off
      // Ticket changes its Origin's.
      publishWith(number, input.epicNumber ?? null, input.originNumber ?? null);
      return getTicket(number);
    },

    /**
     * Creates every Ticket in `input.tickets` in one Project, in order, by
     * the rules for creating one, with the Blockers each names by position
     * among the earlier ones and by number among existing Tickets (by the
     * rules for adding a Blocker), under an Epic when `epicNumber` is given, and
     * planned into a Cycle when `cycleId` is.
     * A `{{T:n}}` in a title, description or criterion text becomes
     * `T<number>` of the Ticket at position n of the batch, anywhere in the
     * text. All or nothing: a refusal names the offending Ticket by position
     * and creates none. The new Tickets are announced once.
     */
    createTicketBatch(input: CreateTicketBatchInput): Ticket[] {
      throwFieldErrors({
        tickets:
          input.tickets.length === 0
            ? 'Give at least one Ticket to create.'
            : input.tickets.length > maxBatchSize
              ? `Create at most ${maxBatchSize} Tickets at a time.`
              : undefined,
      });
      const batchSize = input.tickets.length;
      const checked = input.tickets.map((ticket, position) =>
        checkBatchTicket(ticket, position, batchSize),
      );
      checkBatchLinks(
        input,
        checked.map(({ ticket }) => ticket.values.type),
      );
      checkProjectWritable(input.projectId);
      const project = { id: input.projectId };
      const epicNumber = input.epicNumber ?? null;
      const originNumber = input.originNumber ?? null;

      const {
        created: numbers,
        origins,
        existingBlockers,
      } = db.transaction(() => {
        checkFeedback(
          db,
          project.id,
          input.filedByRun,
          checked.map(({ ticket }) => ticket),
        );
        if (epicNumber !== null) {
          checkEpicChild(db, epicNumber, {
            type: 'Ticket',
            projectId: project.id,
          });
        }
        if (originNumber !== null) {
          checkOrigin(db, originNumber);
        }
        input.tickets.forEach((ticket, position) => {
          const { originNumber } = ticket;
          if (originNumber !== undefined) {
            atPosition(position, 'originNumber', () =>
              checkOrigin(db, originNumber),
            );
          }
        });
        const createdAt = new Date();
        const created: number[] = [];
        const epics = new Set<number>();
        const origins = new Set<number>();
        const existingBlockers = new Set<number>();
        if (epicNumber !== null) {
          epics.add(epicNumber);
        }
        if (originNumber !== null) {
          origins.add(originNumber);
        }
        for (const [
          position,
          { ticket, blockedByPositions, blockedByNumbers },
        ] of checked.entries()) {
          const {
            epicPosition,
            originPosition,
            originNumber: ownOrigin,
          } = input.tickets[position];
          const ticketEpic =
            epicPosition === undefined ? epicNumber : created[epicPosition];
          const ticketOrigin =
            originPosition !== undefined
              ? created[originPosition]
              : (ownOrigin ?? originNumber);
          const number = insertTicket(ctx, ticket, {
            projectId: project.id,
            epicNumber: ticketEpic,
            originNumber: ticketOrigin,
            createdAt,
            filedByRun: input.filedByRun,
          });
          if (epicPosition !== undefined) {
            epics.add(ticketEpic as number);
          }
          if (ticketOrigin !== null) {
            origins.add(ticketOrigin);
          }
          if (blockedByPositions.length > 0) {
            db.insert(ticketBlockers)
              .values(
                blockedByPositions.map((position) => ({
                  blockerNumber: created[position],
                  blockedNumber: number,
                })),
              )
              .run();
          }
          for (const blocker of blockedByNumbers) {
            atPosition(position, 'blockedByNumbers', () =>
              checkBlocker({ blocker, blocked: number }),
            );
            db.insert(ticketBlockers)
              .values({ blockerNumber: blocker, blockedNumber: number })
              .run();
            recordActivity(blocker, [{ type: 'blocksAdded', number }]);
            existingBlockers.add(blocker);
          }
          if (input.cycleId !== undefined) {
            planNewTicket(db, { cycleId: input.cycleId, number }, project.id);
          }
          created.push(number);
        }
        // Only now are all the numbers known; a refusal rolls everything back.
        input.tickets.forEach((ticket, position) => {
          const filled = fillPlaceholders(ticket, (at) => `T${created[at]}`);
          if (
            filled.title === ticket.title &&
            filled.description === ticket.description &&
            filled.acceptanceCriteria?.every(
              ({ text }, i) => text === ticket.acceptanceCriteria?.[i].text,
            ) !== false
          ) {
            return;
          }
          const { values, acceptanceCriteria } = checkBatchTicket(
            filled,
            position,
            batchSize,
          ).ticket;
          const number = created[position];
          db.update(tickets)
            .set({ title: values.title, description: values.description })
            .where(eq(tickets.number, number))
            .run();
          acceptanceCriteria.forEach(({ text }, criterionPosition) => {
            db.update(ticketAcceptanceCriteria)
              .set({ text })
              .where(
                and(
                  eq(ticketAcceptanceCriteria.ticketNumber, number),
                  eq(ticketAcceptanceCriteria.position, criterionPosition),
                ),
              )
              .run();
          });
        });
        // An Origin made in this batch is new, not changed by it.
        for (const origin of origins) {
          if (!created.includes(origin)) {
            touchTicket(origin);
          }
        }
        for (const epic of epics) {
          syncEpicStatus(epic);
        }
        return { created, origins, existingBlockers };
      });
      changes.publish({
        type: 'tickets',
        numbers: [
          ...new Set([
            ...numbers,
            ...(epicNumber === null ? [] : [epicNumber]),
            ...origins,
            ...existingBlockers,
          ]),
        ],
      });
      return numbers.map(getTicket);
    },
  };
}
