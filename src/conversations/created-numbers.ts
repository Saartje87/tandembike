/**
 * The Ticket numbers in the JSON result of file_tickets, as text or as MCP
 * content parts; empty when it names none. Every runner reads it the same
 * way, so a `created` event means the same on any Agent kind.
 */
export function createdNumbers(content: unknown): number[] {
  const text = Array.isArray(content)
    ? content.map((part) => (part?.type === 'text' ? part.text : '')).join('')
    : content;
  if (typeof text !== 'string') {
    return [];
  }
  try {
    const result = JSON.parse(text) as { number?: unknown; numbers?: unknown };
    const numbers = Array.isArray(result.numbers)
      ? result.numbers
      : [result.number];
    return numbers.filter((n): n is number => Number.isInteger(n));
  } catch {
    return [];
  }
}
