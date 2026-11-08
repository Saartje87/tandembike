import { isPullRequestReference } from './external-reference-display';
import type { PaletteColor } from './palette';
import type { Ticket } from './tickets';

/**
 * The Epic a child Ticket belongs to, with the run state its children fall
 * back to: its Claim and whether it has a PR reference (T1143). Agents see
 * only its number, title and colour.
 */
export type EpicLink = Pick<Ticket, 'number' | 'title' | 'claim'> & {
  color: PaletteColor;
  hasPullRequest: boolean;
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
  claim,
  externalReferences,
}: Pick<
  Ticket,
  'number' | 'title' | 'color' | 'claim' | 'externalReferences'
>): EpicLink {
  return {
    number,
    title,
    color: color ?? 'grey',
    claim,
    hasPullRequest: externalReferences.some(isPullRequestReference),
  };
}

/** Epic link `epic` as Agents see it: its number, title and colour. */
export function agentEpicLink({ number, title, color }: EpicLink) {
  return { number, title, color };
}
