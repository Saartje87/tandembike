/** The triage state labels (docs/agents/triage-labels.md): at most one per Ticket. */
export const triageStateLabels = [
  'needs-triage',
  'needs-info',
  'ready-for-agent',
  'ready-for-human',
] as const;

export type TriageStateLabel = (typeof triageStateLabels)[number];

/** Triage state labels that put a Todo Ticket in a Board Lane other than Intake. */
export const readyForAgent: TriageStateLabel = 'ready-for-agent';
export const readyForHuman: TriageStateLabel = 'ready-for-human';

/** The triage role for work that will not be done: not a state label, so completion keeps it. */
export const wontfix = 'wontfix';

/** Whether `label` is a triage state label, which the completion rule removes. */
export const isTriageStateLabel = (label: string): label is TriageStateLabel =>
  (triageStateLabels as readonly string[]).includes(label);

/**
 * Whether a Board row shows `label`: every label but the triage state labels
 * and `wontfix`, since the section a row sits in already says its state.
 */
export const isRowLabel = (label: string): boolean =>
  !isTriageStateLabel(label) && label !== wontfix;
