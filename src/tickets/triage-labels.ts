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
