'use client';

import {
  Box,
  Button,
  Heading,
  Inline,
  Link,
  Stack,
  Text,
} from '@blockle/blocks';
import { type FC, type ReactNode, useEffect, useId } from 'react';

import { modeColors } from '../../app/lib/mode-colors';
import {
  type SettingsSectionId,
  useSettingsShell,
} from '../project-settings/project-settings';

export type SettingsSectionProps = {
  /** The tab it sits in, which shows its unsaved edits. */
  section: SettingsSectionId;
  title: string;
  /** One sentence on what the section is for. */
  description: string;
  /** The longer rules, collapsed under "How this works". */
  help?: ReactNode;
  /** Whether it holds unsaved edits: shows Save and Discard, marks its tab. */
  dirty?: boolean;
  /** Whether its Save is in flight. */
  saving?: boolean;
  /** Puts its fields back to their saved values. */
  onDiscard?: () => void;
  /** Whether it waits on a repository path: shows where to set one. */
  locked?: boolean;
  /** Placed under the card, such as a danger zone. */
  after?: ReactNode;
  children: ReactNode;
};

/**
 * One section of a Project's Settings as a card (T1430): its title, a
 * one-sentence description, the longer rules behind "How this works", and
 * Save and Discard in its header while it holds unsaved edits. Render it
 * inside the section's `form`: Save submits it.
 */
export const SettingsSection: FC<SettingsSectionProps> = ({
  section,
  title,
  description,
  help,
  dirty = false,
  saving = false,
  onDiscard,
  locked = false,
  after,
  children,
}) => {
  const headingId = useId();
  const { select, setDirty } = useSettingsShell();

  useEffect(() => {
    setDirty(section, dirty);
  }, [section, dirty, setDirty]);
  useEffect(() => () => setDirty(section, false), [section, setDirty]);

  return (
    <Stack gap={4}>
      <Box
        asChild
        backgroundColor={modeColors.raised}
        borderRadius={3}
        boxShadow={1}
        padding={[3, 4]}
      >
        <section aria-labelledby={headingId}>
          <Stack gap={4}>
            <Inline gap={3} alignX="between" alignY="start">
              <Stack gap={1}>
                <Heading level={2} id={headingId}>
                  {title}
                </Heading>
                <Text tag="p" fontSize="small" color="muted">
                  {description}
                </Text>
                {help && (
                  <details>
                    <Box asChild cursor="pointer">
                      <summary>
                        <Text tag="span" fontSize="small" color="muted">
                          How this works
                        </Text>
                      </summary>
                    </Box>
                    <Stack gap={1} paddingBlockStart={1}>
                      {help}
                    </Stack>
                  </details>
                )}
              </Stack>
              {dirty && (
                <Inline gap={2} alignY="center">
                  <Button
                    type="button"
                    size="small"
                    variant="ghost"
                    disabled={saving}
                    onClick={onDiscard}
                  >
                    Discard
                  </Button>
                  <Button type="submit" size="small" loading={saving}>
                    Save
                  </Button>
                </Inline>
              )}
            </Inline>
            {locked && (
              <Text tag="p" fontSize="small" color="muted">
                Set a repository path first{' '}
                <Link
                  href="?section=repository#repository-path"
                  onClick={(event) => {
                    event.preventDefault();
                    select('repository', 'repository-path');
                  }}
                >
                  → Repository
                </Link>
              </Text>
            )}
            {children}
          </Stack>
        </section>
      </Box>
      {after}
    </Stack>
  );
};
