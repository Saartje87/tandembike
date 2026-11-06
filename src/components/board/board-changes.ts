import type { Ticket } from '../../tickets/tickets';
import { isTriageStateLabel } from '../../tickets/triage-labels';

/**
 * The completion rule as the Board shows it before the server answers: the
 * Ticket is Done and its triage state label is gone. Other labels stay.
 */
export function completed<T extends Pick<Ticket, 'status' | 'labels'>>(
  ticket: T,
): T {
  return {
    ...ticket,
    status: 'Done',
    labels: ticket.labels.filter((label) => !isTriageStateLabel(label)),
  };
}
