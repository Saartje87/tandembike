/**
 * What a tool call does, in the status line's own terms (T1066, ADR 0051):
 * a verb with its target, such as Reading `a.ts`, or a Tandembike tool by
 * its own name. Each runner maps its agent's tool names to it, so the status
 * line reads no agent's tool names.
 */
export type ToolActivity =
  | { verb: string; target?: string }
  | { tandembike: string; ticketNumber?: number };

const withTarget = (verb: string, target: string | undefined) =>
  target ? `${verb} ${target}` : verb;

/**
 * The Tandembike tools: the line with `{T}` for the Ticket number, and the
 * line to use when the call names none.
 */
const tandembikeLines: Record<string, [line: string, without: string]> = {
  next_work: ['Finding the next work', 'Finding the next work'],
  start_work: ['Starting {T}', 'Starting a Ticket'],
  add_note: ['Commenting on {T}', 'Commenting'],
  propose_triage: ['Proposing triage for {T}', 'Proposing triage'],
  check_criterion: ['Checking criteria of {T}', 'Checking criteria'],
  open_pr: ['Linking a pull request to {T}', 'Linking a pull request'],
  finish_work: ['Finishing {T}', 'Finishing a Ticket'],
  abandon_work: ['Giving up {T}', 'Giving up a Ticket'],
  file_tickets: ['Creating Tickets', 'Creating Tickets'],
  find_tickets: ['Listing Tickets', 'Listing Tickets'],
  attach: ['Attaching a file to {T}', 'Attaching a file'],
  read_attachment: ['Reading an attachment of {T}', 'Reading an attachment'],
  get_project: ['Reading a Project', 'Reading a Project'],
  get_ticket: ['Reading {T}', 'Reading a Ticket'],
  update_ticket: ['Updating {T}', 'Updating a Ticket'],
  create_cycle: ['Creating a Cycle', 'Creating a Cycle'],
  update_cycle: ['Renaming a Cycle', 'Renaming a Cycle'],
};

const humanise = (name: string) => {
  const words = name.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** A tool's activity in a few words, such as "Reading a.ts" or "Starting T42". */
export function activityLine(activity: ToolActivity): string {
  if ('verb' in activity) {
    return withTarget(activity.verb, activity.target);
  }
  const lines = tandembikeLines[activity.tandembike];
  if (!lines) {
    return humanise(activity.tandembike);
  }
  return activity.ticketNumber === undefined
    ? lines[1]
    : lines[0].replace('{T}', `T${activity.ticketNumber}`);
}
