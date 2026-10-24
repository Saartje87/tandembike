/**
 * What kind of Ticket it is, fixed when it is created: a normal Ticket, or
 * an Epic that groups child Tickets (ADR 0011).
 */
export const ticketTypes = ['Ticket', 'Epic'] as const;

export type TicketType = (typeof ticketTypes)[number];

/** Whether `value` is one of the Ticket types, for input from outside. */
export function isTicketType(value: unknown): value is TicketType {
  return (ticketTypes as readonly unknown[]).includes(value);
}
