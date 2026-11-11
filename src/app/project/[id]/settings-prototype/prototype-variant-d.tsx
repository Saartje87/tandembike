'use client';

// PROTOTYPE (T1431): variant D, B's cards inside Blocks Tabs, one section per
// tab. The tab sits in `?section=`; a field anchor (#check-command) opens the
// tab that holds it. Unsaved edits survive a tab switch and mark the tab.

import {
  Box,
  Grid,
  GridItem,
  Heading,
  Inline,
  Link,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Tooltip,
} from '@blockle/blocks';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FC, useEffect } from 'react';

import { modeColors } from '../../../../app/lib/mode-colors';
import { Icon } from '../../../../components/icon/icon';
import {
  DangerZone,
  DirtyDot,
  HowThisWorks,
  SectionActions,
  StylePicker,
} from './prototype-parts';
import {
  fieldsOf,
  type PrototypeState,
  type SectionId,
  sections,
} from './prototype-state';
import { lockedOf, ReferenceRows, StackedField } from './prototype-variants';

/** `checkCommand` as `check-command`, the field's anchor. */
const anchorOf = (key: string) =>
  key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const UnsavedMarker: FC<{ state: PrototypeState }> = ({ state }) => (
  <Tooltip content="Unsaved changes">
    {state.marker === 'dot' ? (
      <span>
        <DirtyDot />
      </span>
    ) : (
      <span role="img" aria-label="Unsaved changes">
        <Icon name="pencil-square" size="small" color={modeColors.warning} />
      </span>
    )}
  </Tooltip>
);

export const VariantD: FC<{ state: PrototypeState }> = ({ state }) => {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fallback: SectionId = state.hasRepository ? 'general' : 'repository';
  const asked = params.get('section');
  const selected = sections.some(({ id }) => id === asked)
    ? (asked as SectionId)
    : fallback;

  const select = (section: string, anchor?: string) => {
    const next = new URLSearchParams(params);
    next.set('section', section);
    router.replace(`${pathname}?${next}${anchor ? `#${anchor}` : ''}`, {
      scroll: false,
    });
  };

  // A field anchor opens its tab, then scrolls to the field; only on first
  // load, as a deep link.
  // biome-ignore lint/correctness/useExhaustiveDependencies: prototype
  useEffect(() => {
    const anchor = window.location.hash.slice(1);
    if (!anchor) return;
    const owner = sections.find((section) =>
      fieldsOf(section).some(({ key }) => anchorOf(key) === anchor),
    );
    if (owner && owner.id !== selected) select(owner.id, anchor);
    setTimeout(
      () =>
        document
          .getElementById(anchor)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      100,
    );
  }, []);

  return (
    <Tabs value={selected} onValueChange={(value) => select(value)}>
      <Stack gap={4}>
        <TabList aria-label="Settings sections">
          {sections.map((section) => (
            <Tab
              key={section.id}
              value={section.id}
              endSlot={
                state.dirty(section) ? <UnsavedMarker state={state} /> : null
              }
            >
              {section.title}
            </Tab>
          ))}
        </TabList>
        {sections.map((section) => {
          const locked = lockedOf(section, state);
          const dirty = state.dirty(section);
          return (
            <TabPanel key={section.id} value={section.id}>
              <Box
                backgroundColor={modeColors.raised}
                borderRadius={3}
                boxShadow={1}
                padding={[3, 4]}
              >
                <Stack gap={4}>
                  <Inline gap={3} alignX="between" alignY="start">
                    <Stack gap={1}>
                      <Heading level={2}>{section.title}</Heading>
                      <Text tag="p" fontSize="small" color="muted">
                        {section.description}
                      </Text>
                      <HowThisWorks section={section} />
                    </Stack>
                    {dirty && (
                      <SectionActions section={section} state={state} />
                    )}
                  </Inline>
                  {locked && (
                    <Text tag="p" fontSize="small" color="muted">
                      Set a repository path first{' '}
                      <Link
                        href="?section=repository"
                        onClick={(event) => {
                          event.preventDefault();
                          select('repository', 'repository-path');
                        }}
                      >
                        → Repository
                      </Link>
                    </Text>
                  )}
                  {section.id === 'references' ? (
                    <ReferenceRows state={state} />
                  ) : (
                    <>
                      {section.id === 'general' && <StylePicker />}
                      <Grid rowGap={5} columnGap={[0, 5]}>
                        {section.groups.map((group, index) => (
                          <GridItem
                            key={group.title ?? index}
                            colSpan={group.title ? [12, 6] : 12}
                          >
                            <Stack gap={3}>
                              {group.title && (
                                <Text tag="p" fontWeight="bold">
                                  {group.title}
                                </Text>
                              )}
                              {group.fields.map((field) => (
                                <div key={field.key} id={anchorOf(field.key)}>
                                  <StackedField
                                    field={field}
                                    state={state}
                                    disabled={locked}
                                  />
                                </div>
                              ))}
                            </Stack>
                          </GridItem>
                        ))}
                      </Grid>
                    </>
                  )}
                </Stack>
              </Box>
              {section.id === 'general' && (
                <Box paddingBlockStart={4}>
                  <DangerZone />
                </Box>
              )}
            </TabPanel>
          );
        })}
      </Stack>
    </Tabs>
  );
};
