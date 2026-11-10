/**
 * The moves a Spar's button bar sends, each as the message the transcript
 * shows (GLOSSARY: Spar). Shared by the bar and the Spars module, whose Close
 * sends Summarise. An empty message is Your move: the Canvas changes alone.
 */

export const summariseMessage =
  'Summarise: update the Write-up with update_write_up, its Decisions, Open questions and Next steps so far, then sum up where we are in a few lines.';

/** The message We agree sends: it asks the Agent for a Hand-off draft. */
export const weAgreeMessage =
  'We agree. Propose the Hand-off with propose_hand_off: an idea Ticket with a title, a description built from the Write-up (Decisions and Open questions), and your recommended path, ticket for normal triage or spec to spec it now.';

/** Where an approved Hand-off goes: filed for triage, or specced at once. */
export const handOffPaths = ['ticket', 'spec'] as const;
export type HandOffPath = (typeof handOffPaths)[number];

/** An idea Ticket the Agent drafted for the User to edit and approve. */
export type HandOffDraft = {
  title: string;
  description: string;
  /** The Agent's recommendation. */
  path: HandOffPath;
};

export const sparMoves = [
  {
    label: 'Challenge me',
    message:
      'Challenge me: find the weakest point in what we have and push back on it.',
  },
  {
    label: 'Diverge',
    message:
      'Diverge: widen the options. Add new ideas to the Canvas, including ones I would not think of.',
  },
  {
    label: 'Converge',
    message: 'Converge: narrow it down. Help me choose, and park what we drop.',
  },
  { label: 'Summarise', message: summariseMessage },
  { label: 'Your move', message: '' },
  { label: 'We agree', message: weAgreeMessage },
] as const;
