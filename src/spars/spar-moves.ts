/**
 * The moves a Spar's button bar sends, each as the message the transcript
 * shows (GLOSSARY: Spar). Shared by the bar and the Spars module, whose Close
 * sends Summarise. An empty message is Your move: the Canvas changes alone.
 */

export const summariseMessage =
  'Summarise: update the Write-up with update_write_up, its Decisions, Open questions and Next steps so far, then sum up where we are in a few lines.';

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
] as const;
