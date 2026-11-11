import {
  checkExternalReferences,
  normalizeExternalReferences,
} from './external-references';
import { isPaletteColor, paletteRule } from './palette';
import {
  checkTitle,
  maxAcceptanceCriteria,
  maxAcceptanceCriterionLength,
  maxDescriptionLength,
  maxLabelLength,
  throwFieldErrors,
} from './rules';
import { isStatus, statusRule } from './status';
import type { AcceptanceCriterionInput, UpdateTicketInput } from './tickets';

// The rules for a Ticket's fields that more than one area of the Tickets
// module applies: creating and changing a Ticket, and the lifecycle steps.

export function checkDescription(description: string): string | undefined {
  if (description.length > maxDescriptionLength) {
    return `Keep the description to ${maxDescriptionLength.toLocaleString('en-US')} characters or fewer.`;
  }
  return undefined;
}

export function checkStatus(status: string): string | undefined {
  return isStatus(status) ? undefined : statusRule;
}

/** Labels as they are stored: trimmed, lower-cased and each once. */
export function normalizeLabels(labels: readonly string[]): string[] {
  return [...new Set(labels.map((label) => label.trim().toLowerCase()))];
}

/** Why one of the normalized `labels` breaks the rules, if any does. */
export function checkLabels(labels: readonly string[]): string | undefined {
  for (const label of labels) {
    if (label === '') {
      return 'Enter a label.';
    }
    if (/[\r\n]/.test(label)) {
      return 'Keep each label to one line.';
    }
    if (label.length > maxLabelLength) {
      return `Keep each label to ${maxLabelLength} characters or fewer.`;
    }
  }
  return undefined;
}

/** Why one of the trimmed criterion `texts` breaks the rules, if any does. */
export function checkAcceptanceCriteria(
  texts: readonly string[],
): string | undefined {
  if (texts.length > maxAcceptanceCriteria) {
    return `Keep to ${maxAcceptanceCriteria} acceptance criteria or fewer.`;
  }
  for (const text of texts) {
    if (text === '') {
      return 'Enter text for each acceptance criterion.';
    }
    if (/[\r\n]/.test(text)) {
      return 'Keep each acceptance criterion to one line.';
    }
    if (text.length > maxAcceptanceCriterionLength) {
      return `Keep each acceptance criterion to ${maxAcceptanceCriterionLength} characters or fewer.`;
    }
  }
  return undefined;
}

/** The fields of a Ticket row an update may set. */
export type TicketValues = Pick<
  UpdateTicketInput,
  'title' | 'description' | 'status' | 'projectId' | 'color' | 'originNumber'
>;

/**
 * A checked Ticket update: the row fields given, normalized labels and
 * External references, and the trimmed acceptance criteria, if given.
 */
export type TicketChanges = {
  values: TicketValues;
  addLabels: string[];
  removeLabels: string[];
  addExternalReferences: string[];
  removeExternalReferences: string[];
  acceptanceCriteria?: AcceptanceCriterionInput[];
};

/**
 * The cleaned-up fields of a Ticket update, holding only the fields given,
 * or a `ValidationError` by the same rules as creating a Ticket. A label or
 * External reference named both to add and to remove is refused.
 */
export function checkTicketChanges(input: UpdateTicketInput): TicketChanges {
  const title = input.title?.trim();
  const { description, status, projectId, color, originNumber } = input;
  const addLabels = normalizeLabels(input.addLabels ?? []);
  const removeLabels = normalizeLabels(input.removeLabels ?? []);
  const inBoth = addLabels.filter((label) => removeLabels.includes(label));
  const addExternalReferences = normalizeExternalReferences(
    input.addExternalReferences ?? [],
  );
  const removeExternalReferences = normalizeExternalReferences(
    input.removeExternalReferences ?? [],
  );
  const referencesInBoth = addExternalReferences.filter((reference) =>
    removeExternalReferences.includes(reference),
  );
  const acceptanceCriteria = input.acceptanceCriteria?.map((criterion) => ({
    ...criterion,
    text: criterion.text.trim(),
  }));

  throwFieldErrors({
    title: title === undefined ? undefined : checkTitle(title),
    description:
      description === undefined ? undefined : checkDescription(description),
    status: status === undefined ? undefined : checkStatus(status),
    color:
      color === undefined || isPaletteColor(color) ? undefined : paletteRule,
    addLabels: checkLabels(addLabels),
    removeLabels: checkLabels(removeLabels),
    labels:
      inBoth.length === 0
        ? undefined
        : `Name each label in addLabels or removeLabels, not both: ${inBoth.join(', ')}.`,
    addExternalReferences: checkExternalReferences(addExternalReferences),
    removeExternalReferences: checkExternalReferences(removeExternalReferences),
    externalReferences:
      referencesInBoth.length === 0
        ? undefined
        : `Name each External reference in addExternalReferences or removeExternalReferences, not both: ${referencesInBoth.join(', ')}.`,
    acceptanceCriteria:
      acceptanceCriteria === undefined
        ? undefined
        : (checkAcceptanceCriteria(
            acceptanceCriteria.map(({ text }) => text),
          ) ?? checkCriterionIds(acceptanceCriteria)),
  });
  const values = Object.fromEntries(
    Object.entries({
      title,
      description,
      status,
      projectId,
      color,
      originNumber,
    }).filter(([, value]) => value !== undefined),
  ) as TicketValues;
  return {
    values,
    addLabels,
    removeLabels,
    addExternalReferences,
    removeExternalReferences,
    acceptanceCriteria,
  };
}

/** The ids of the `criteria` that have one, in order. */
export function givenIds(criteria: readonly { id?: number }[]): number[] {
  return criteria.flatMap(({ id }) => (id === undefined ? [] : [id]));
}

/** Why Ticket `number` has no acceptance criterion `id`. */
export function noSuchCriterion(number: number, id: number | undefined) {
  return `Ticket T${number} has no acceptance criterion ${id}.`;
}

/** Why the ids in a list of criteria break the rules, if they do. */
export function checkCriterionIds(criteria: readonly { id?: number }[]) {
  const ids = givenIds(criteria);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  return duplicate === undefined
    ? undefined
    : `Give each acceptance criterion once: ${duplicate} is given twice.`;
}
