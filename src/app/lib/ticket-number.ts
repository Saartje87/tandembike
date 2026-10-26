/** Why a field's text is not a Ticket number. */
export const ticketNumberRule = 'Enter a Ticket number, like T42.';

/** The Ticket number in `text`, written `T42`, `42` or, as it once was, `#42`, if it holds one. */
export function parseTicketNumber(text: string): number | undefined {
  const match = /^[#Tt]?(\d+)$/.exec(text.trim());
  const number = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}
