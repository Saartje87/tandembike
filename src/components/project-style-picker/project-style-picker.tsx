'use client';

import { Alert, Box, Button, Popover, Stack, Text } from '@blockle/blocks';
import { type FC, useRef, useState } from 'react';

import {
  type ProjectIcon as IconChoice,
  projectIcons,
} from '../../tickets/project-icons';
import type { Project, StyleProjectInput } from '../../tickets/tickets';
import { ColorSwatches } from '../color-swatches/color-swatches';
import { Icon } from '../icon/icon';
import { ProjectIcon } from '../project-icon/project-icon';
import * as styles from './project-style-picker.css';

export type ProjectStylePickerProps = {
  /** The colour and icon shown now, the pending pick included. */
  style: Pick<Project, 'color' | 'icon'>;
  /** Saves a pick: one of `color` and `icon`. */
  onPick: (pick: StyleProjectInput) => void;
  /** Why the last pick was refused, shown in the popover. */
  error?: string;
};

/** `rocket-launch` as `Rocket launch`, for an icon button's name. */
function iconName(icon: IconChoice): string {
  const words = icon.replaceAll('-', ' ');
  return words[0].toUpperCase() + words.slice(1);
}

/**
 * The Project's icon as a button that opens a popover to pick its colour
 * and icon, each with a Default that clears it. It stays open until
 * dismissed, so the User can try a few.
 */
export const ProjectStylePicker: FC<ProjectStylePickerProps> = ({
  style,
  onPick,
  error,
}) => {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        ref={anchor}
        type="button"
        variant="ghost"
        size="small"
        aria-label="Colour and icon"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ProjectIcon project={style} size="medium" />
      </Button>
      <Popover
        anchorElement={anchor}
        open={open}
        position="bottom"
        className={styles.popover}
        onRequestClose={() => setOpen(false)}
        role="dialog"
        aria-label="Colour and icon"
      >
        <Stack gap={3} padding={3} className={styles.panel}>
          <ColorSwatches
            value={style.color}
            withDefault
            onPick={(color) => onPick({ color })}
          />
          <Box asChild border="none" padding={0} margin={0}>
            <fieldset>
              <Text asChild fontSize="small" fontWeight="strong">
                <legend>Icon</legend>
              </Text>
              <Box marginBlockStart={2} className={styles.icons}>
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  aria-label="Default"
                  aria-pressed={style.icon === null}
                  onClick={() => onPick({ icon: null })}
                >
                  <Icon name="no-symbol" size="medium" color="neutral-700" />
                </Button>
                {projectIcons.map((icon) => (
                  <Button
                    key={icon}
                    type="button"
                    variant="ghost"
                    size="small"
                    aria-label={iconName(icon)}
                    aria-pressed={style.icon === icon}
                    onClick={() => onPick({ icon })}
                  >
                    <Icon name={icon} size="medium" />
                  </Button>
                ))}
              </Box>
            </fieldset>
          </Box>
          {error && <Alert intent="error">{error}</Alert>}
        </Stack>
      </Popover>
    </>
  );
};
