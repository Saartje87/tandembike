import type { PaletteColor } from './palette';
import type { Ticket } from './tickets';

/** The Epic a child Ticket belongs to. */
export type EpicLink = Pick<Ticket, 'number' | 'title'> & {
  color: PaletteColor;
};

/**
 * Epic `epic` as its children link to it. Every Epic has a colour; grey
 * only stands in should one ever lack it.
 *
 * Its own module so client components can use it without bundling
 * `tickets.ts`, which imports Node built-ins.
 */
export function epicLinkOf({
  number,
  title,
  color,
}: Pick<Ticket, 'number' | 'title' | 'color'>): EpicLink {
  return { number, title, color: color ?? 'grey' };
}
