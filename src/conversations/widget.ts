import { ValidationError } from '../tickets/errors';

/**
 * Widgets (GLOSSARY: Widget, ADR 0045): typed questions an Agent asks the
 * User through a tool that blocks its run until the User answers in the chat.
 * This file holds their shapes and the one check of an answer against its
 * Widget; it knows nothing of runs or the transcript.
 */

/** One option of a choice Widget. */
export type WidgetOption = { label: string; description?: string };

/** Choice cards, single or multi select; `recommended` options start selected. */
export type ChoiceWidget = {
  kind: 'choice';
  prompt: string;
  options: WidgetOption[];
  multiSelect: boolean;
  recommended?: string[];
};

/** Items the User drags into order, most important first. */
export type RankWidget = { kind: 'rank'; prompt: string; items: string[] };

/** A slider per item from `min` to `max`, its ends optionally labelled. */
export type ScaleWidget = {
  kind: 'scale';
  prompt: string;
  items: string[];
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
};

export type Widget = ChoiceWidget | RankWidget | ScaleWidget;
export type WidgetKind = Widget['kind'];

/** What the User gave besides the Widget's own answer: free text, a Skip, or nothing because the run ended. */
export type OtherAnswer = { other: string };
export type SkippedAnswer = { skipped: true };
export type ExpiredAnswer = { expired: true };

export type ChoiceAnswer = { selected: string[] };
export type RankAnswer = { order: string[] };
export type ScaleAnswer = { values: { item: string; value: number }[] };

/** A Widget's answer as the Agent gets it back. */
export type WidgetAnswer =
  | ChoiceAnswer
  | RankAnswer
  | ScaleAnswer
  | OtherAnswer
  | SkippedAnswer
  | ExpiredAnswer;

/**
 * A Widget in the transcript: the Widget, the User's answer once given, and
 * `expired` when its run ended first.
 */
export type WidgetEntry = {
  widget: Widget;
  answer: WidgetAnswer | null;
  expired: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringsOf = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : null;

const unfit = (kind: WidgetKind) =>
  new ValidationError({
    answer: `This answer does not fit a ${kind} Widget.`,
  });

const checkChoice = (
  widget: ChoiceWidget,
  selected: string[],
): ChoiceAnswer => {
  const labels = new Set(widget.options.map(({ label }) => label));
  const unique = [...new Set(selected)];
  if (unique.length === 0) {
    throw new ValidationError({ selected: 'Choose an option.' });
  }
  if (!widget.multiSelect && unique.length > 1) {
    throw new ValidationError({ selected: 'Choose one option.' });
  }
  const unknown = unique.find((label) => !labels.has(label));
  if (unknown !== undefined) {
    throw new ValidationError({
      selected: `"${unknown}" is not one of the options.`,
    });
  }
  return { selected: unique };
};

const checkRank = (widget: RankWidget, order: string[]): RankAnswer => {
  const sorted = (items: string[]) => [...items].sort().join('\n');
  if (
    order.length !== widget.items.length ||
    sorted(order) !== sorted(widget.items)
  ) {
    throw new ValidationError({ order: 'Put every item in order once.' });
  }
  return { order };
};

const checkScale = (widget: ScaleWidget, values: unknown[]): ScaleAnswer => {
  const byItem = new Map<string, number>();
  for (const entry of values) {
    if (
      !isRecord(entry) ||
      typeof entry.item !== 'string' ||
      typeof entry.value !== 'number' ||
      !Number.isFinite(entry.value)
    ) {
      throw new ValidationError({ values: 'Give each item a number.' });
    }
    if (!widget.items.includes(entry.item)) {
      throw new ValidationError({
        values: `"${entry.item}" is not one of the items.`,
      });
    }
    if (entry.value < widget.min || entry.value > widget.max) {
      throw new ValidationError({
        values: `Each value is from ${widget.min} to ${widget.max}.`,
      });
    }
    byItem.set(entry.item, entry.value);
  }
  if (byItem.size !== widget.items.length) {
    throw new ValidationError({ values: 'Give every item a value.' });
  }
  return {
    values: widget.items.map((item) => ({
      item,
      value: byItem.get(item) as number,
    })),
  };
};

/**
 * The User's answer to `widget`, checked and tidied: the Widget's own kind of
 * answer, Other with its text, or Skip. Refused with a ValidationError when it
 * does not fit the Widget. `expired` is never the User's to give.
 */
export function checkWidgetAnswer(
  widget: Widget,
  answer: unknown,
): WidgetAnswer {
  if (!isRecord(answer)) {
    throw unfit(widget.kind);
  }
  if (answer.skipped === true) {
    return { skipped: true };
  }
  if (typeof answer.other === 'string') {
    const other = answer.other.trim();
    if (other === '') {
      throw new ValidationError({ other: 'Write your answer.' });
    }
    return { other };
  }
  switch (widget.kind) {
    case 'choice': {
      const selected = stringsOf(answer.selected);
      if (selected === null) {
        break;
      }
      return checkChoice(widget, selected);
    }
    case 'rank': {
      const order = stringsOf(answer.order);
      if (order === null) {
        break;
      }
      return checkRank(widget, order);
    }
    case 'scale': {
      if (!Array.isArray(answer.values)) {
        break;
      }
      return checkScale(widget, answer.values);
    }
  }
  throw unfit(widget.kind);
}

/**
 * `widget` as the chat shows it: recommended labels that are no option are
 * dropped, and a single select keeps at most the first.
 */
export function tidyWidget(widget: Widget): Widget {
  switch (widget.kind) {
    case 'choice': {
      const labels = new Set(widget.options.map(({ label }) => label));
      const recommended = [...new Set(widget.recommended ?? [])].filter(
        (label) => labels.has(label),
      );
      return {
        ...widget,
        recommended: widget.multiSelect ? recommended : recommended.slice(0, 1),
      };
    }
    case 'rank':
      return { ...widget, items: [...new Set(widget.items)] };
    case 'scale': {
      const min = Math.min(widget.min, widget.max);
      const max = Math.max(widget.min, widget.max);
      return { ...widget, items: [...new Set(widget.items)], min, max };
    }
  }
}

/** The Widget's prompt as one transcript line, for the Status line and Notices. */
export const widgetText = (widget: Widget): string => widget.prompt;
