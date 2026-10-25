/** Why a field's text is not a Ticket number. */
export const ticketNumberRule = 'Enter a Ticket number, like 42.';

/** The Ticket number in `text`, written `42` or `#42`, if it holds one. */
export function parseTicketNumber(text: string): number | undefined {
  const match = /^#?(\d+)$/.exec(text.trim());
  const number = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}
