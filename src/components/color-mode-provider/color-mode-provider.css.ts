import { vars } from '@blockle/blocks';
import { globalStyle } from '@vanilla-extract/css';

// The page behind everything takes the Color mode's surface and text, also
// past the end of the content.
globalStyle('body', {
  backgroundColor: vars.colorRole.surface.default,
  color: vars.colorRole.text.default,
});
