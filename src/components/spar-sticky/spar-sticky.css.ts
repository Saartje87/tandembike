import { vars } from '@blockle/blocks';
import { keyframes, style } from '@vanilla-extract/css';

const arrive = keyframes({
  from: { opacity: 0, transform: 'scale(0.9)' },
  to: { opacity: 1, transform: 'scale(1)' },
});

/** A Sticky: a raised note. */
export const sticky = style({
  backgroundColor: vars.colorRole.surface.raised,
  borderRadius: vars.borderRadius[2],
  padding: vars.space[2],
  boxShadow: vars.colorRole.shadow[1],
  listStyle: 'none',
  selectors: {
    // The Agent's new Stickies animate in, so the User sees what changed.
    '&[data-arrived="true"]': {
      animation: `${arrive} ${vars.transition.slow} ease-out`,
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      selectors: { '&[data-arrived="true"]': { animation: 'none' } },
    },
  },
});
