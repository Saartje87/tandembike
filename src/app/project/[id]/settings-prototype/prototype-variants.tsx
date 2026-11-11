'use client';

// PROTOTYPE (T1431): three layouts of the agreed settings page (Epic T1430).
// A: side nav, open sections, Save at the section's foot.
// B: chip nav on every width, each section a card with Save in its header.
// C: side nav, settings as label | control rows, a sticky save bar per section.

import {
  Box,
  Button,
  Divider,
  Grid,
  GridItem,
  Heading,
  Inline,
  Label,
  Stack,
  Text,
  TextInput,
} from '@blockle/blocks';
import { type FC, Fragment, useId } from 'react';

import { modeColors } from '../../../../app/lib/mode-colors';
import {
  ChipNav,
  Control,
  DangerZone,
  DetectButton,
  DirtyDot,
  HowThisWorks,
  RepositoryNotice,
  SavedFlash,
  SectionActions,
  SetupOffer,
  SideNav,
  StylePicker,
} from './prototype-parts';
import {
  type Field,
  type FieldGroup,
  type PrototypeState,
  type Section,
  sections,
} from './prototype-state';

type VariantProps = { state: PrototypeState };

type FieldProps = {
  field: Field;
  state: PrototypeState;
  disabled: boolean;
};

const lockedOf = (section: Section, state: PrototypeState) =>
  section.needsRepository === true && !state.hasRepository;

/** References as prefix → URL rows, the same in every variant. */
const ReferenceRows: FC<VariantProps> = ({ state }) => {
  const section = sections.find(({ id }) => id === 'references');
  const fields = section?.groups[0].fields ?? [];
  const pairs = [fields.slice(0, 2), fields.slice(2, 4)];
  return (
    <Stack gap={2}>
      {pairs.map(([prefix, url]) => (
        <Grid key={prefix.key} gap={2}>
          <GridItem colSpan={[4, 3]}>
            <Control field={prefix} state={state} id={`ref-${prefix.key}`} />
          </GridItem>
          <GridItem colSpan={[8, 9]}>
            <Control field={url} state={state} id={`ref-${url.key}`} />
          </GridItem>
        </Grid>
      ))}
      <Inline gap={2}>
        <TextInput placeholder="Prefix" aria-label="New prefix" />
        <Button type="button" size="small" variant="outline">
          Add template
        </Button>
      </Inline>
    </Stack>
  );
};

// ---------------------------------------------------------------- Variant A

const StackedField: FC<FieldProps> = ({ field, state, disabled }) => {
  const id = useId();
  if (field.kind === 'switch') {
    const on = state.draft[field.key] === true;
    return (
      <Stack gap={2}>
        <Stack gap={1}>
          <Inline gap={2} alignY="center">
            <Control field={field} state={state} id={id} disabled={disabled} />
            <Label htmlFor={id}>{field.label}</Label>
            <SavedFlash field={field} state={state} />
          </Inline>
          {field.hint && (
            <Text tag="p" fontSize="small" color="muted">
              {field.hint}
            </Text>
          )}
        </Stack>
        <SetupOffer field={field} state={state} />
        {field.children && (
          <Box paddingInlineStart={6}>
            <Grid rowGap={3} columnGap={[0, 3]}>
              {field.children.map((child) => (
                <GridItem key={child.key} colSpan={[12, 6]}>
                  <StackedField
                    field={child}
                    state={state}
                    disabled={disabled || !on}
                  />
                </GridItem>
              ))}
            </Grid>
          </Box>
        )}
      </Stack>
    );
  }
  return (
    <Stack gap={1}>
      {field.kind === 'radio' ? (
        <Text tag="p" id={id} fontWeight="bold">
          {field.label}
        </Text>
      ) : (
        <Label htmlFor={id}>{field.label}</Label>
      )}
      <Control field={field} state={state} id={id} disabled={disabled} />
      {field.hint && (
        <Text tag="p" fontSize="small" color="muted">
          {field.hint}
        </Text>
      )}
      {field.key === 'repositoryPath' && <DetectButton />}
    </Stack>
  );
};

const StackedGroups: FC<{
  section: Section;
  state: PrototypeState;
  disabled: boolean;
}> = ({ section, state, disabled }) => (
  <Stack gap={5}>
    {section.groups.map((group: FieldGroup, index) => (
      <Stack key={group.title ?? index} gap={3}>
        {group.title && (
          <Heading level={3} fontSize="medium">
            {group.title}
          </Heading>
        )}
        {group.fields.map((field) => (
          <StackedField
            key={field.key}
            field={field}
            state={state}
            disabled={disabled}
          />
        ))}
      </Stack>
    ))}
  </Stack>
);

const SectionBodyA: FC<{ section: Section; state: PrototypeState }> = ({
  section,
  state,
}) => {
  const locked = lockedOf(section, state);
  if (section.id === 'references') return <ReferenceRows state={state} />;
  return (
    <Stack gap={4}>
      {locked && <RepositoryNotice />}
      {section.id === 'general' && <StylePicker />}
      <StackedGroups section={section} state={state} disabled={locked} />
      {section.id === 'general' && <DangerZone />}
    </Stack>
  );
};

export const VariantA: FC<VariantProps> = ({ state }) => (
  <Grid rowGap={5} columnGap={[0, 0, 5]}>
    <GridItem colSpan={[12, 12, 3]}>
      <Box
        position="sticky"
        insetBlockStart={0}
        paddingBlock={2}
        backgroundColor={modeColors.sunken}
      >
        <Box display={['block', 'block', 'none']}>
          <ChipNav sections={sections} state={state} />
        </Box>
        <Box display={['none', 'none', 'block']}>
          <SideNav sections={sections} state={state} />
        </Box>
      </Box>
    </GridItem>
    <GridItem colSpan={[12, 12, 9]}>
      <Stack gap={6}>
        {sections.map((section, index) => (
          <Fragment key={section.id}>
            {index > 0 && <Divider />}
            <Stack gap={4} id={section.id} asChild>
              <section aria-labelledby={`${section.id}-a`}>
                <Stack gap={1}>
                  <Heading level={2} id={`${section.id}-a`}>
                    {section.title}
                  </Heading>
                  <Text tag="p" fontSize="small" color="muted">
                    {section.description}
                  </Text>
                  <HowThisWorks section={section} />
                </Stack>
                <SectionBodyA section={section} state={state} />
                {state.dirty(section) && (
                  <Inline gap={3} alignX="end" alignY="center">
                    <Text tag="span" fontSize="small" color="muted">
                      Unsaved changes
                    </Text>
                    <SectionActions section={section} state={state} />
                  </Inline>
                )}
              </section>
            </Stack>
          </Fragment>
        ))}
      </Stack>
    </GridItem>
  </Grid>
);

// ---------------------------------------------------------------- Variant B

export const VariantB: FC<VariantProps> = ({ state }) => (
  <Stack gap={4}>
    <Box
      position="sticky"
      insetBlockStart={0}
      backgroundColor={modeColors.sunken}
    >
      <ChipNav sections={sections} state={state} />
    </Box>
    <Stack gap={4}>
      {sections.map((section) => {
        const locked = lockedOf(section, state);
        const dirty = state.dirty(section);
        return (
          <Box
            key={section.id}
            id={section.id}
            asChild
            backgroundColor={modeColors.raised}
            borderRadius={3}
            boxShadow={1}
            padding={4}
          >
            <section aria-labelledby={`${section.id}-b`}>
              <Stack gap={4}>
                <Inline gap={3} alignX="between" alignY="start">
                  <Stack gap={1}>
                    <Inline gap={2} alignY="center">
                      <Heading level={2} id={`${section.id}-b`}>
                        {section.title}
                      </Heading>
                      {dirty && <DirtyDot />}
                    </Inline>
                    <Text tag="p" fontSize="small" color="muted">
                      {section.description}
                    </Text>
                  </Stack>
                  {dirty && <SectionActions section={section} state={state} />}
                </Inline>
                {locked && <RepositoryNotice />}
                {section.id === 'references' ? (
                  <ReferenceRows state={state} />
                ) : (
                  <>
                    {section.id === 'general' && <StylePicker />}
                    <Grid rowGap={4} columnGap={[0, 4]}>
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
                              <StackedField
                                key={field.key}
                                field={field}
                                state={state}
                                disabled={locked}
                              />
                            ))}
                          </Stack>
                        </GridItem>
                      ))}
                    </Grid>
                    {section.id === 'general' && <DangerZone />}
                  </>
                )}
                <HowThisWorks section={section} />
              </Stack>
            </section>
          </Box>
        );
      })}
    </Stack>
  </Stack>
);

// ---------------------------------------------------------------- Variant C

const RowField: FC<FieldProps & { nested?: boolean }> = ({
  field,
  state,
  disabled,
  nested,
}) => {
  const id = useId();
  const on = state.draft[field.key] === true;
  return (
    <>
      <Grid gap={2} paddingBlock={3} alignItems="center">
        <GridItem colSpan={[12, 5]}>
          <Box paddingInlineStart={nested ? 4 : 0}>
            <Stack gap={1}>
              {field.kind === 'radio' ? (
                <Text tag="p" id={id} fontWeight="bold">
                  {field.label}
                </Text>
              ) : (
                <Label htmlFor={id}>{field.label}</Label>
              )}
              {field.hint && (
                <Text tag="p" fontSize="small" color="muted">
                  {field.hint}
                </Text>
              )}
            </Stack>
          </Box>
        </GridItem>
        <GridItem colSpan={[12, 7]}>
          {field.key === 'repositoryPath' ? (
            <Inline gap={2} flexWrap="nowrap" alignY="center">
              <Box flexGrow={1}>
                <Control field={field} state={state} id={id} />
              </Box>
              <DetectButton />
            </Inline>
          ) : (
            <Inline gap={2} alignY="center" flexWrap="nowrap">
              <Box flexGrow={1}>
                <Control
                  field={field}
                  state={state}
                  id={id}
                  disabled={disabled}
                />
              </Box>
              {field.kind === 'switch' && (
                <SavedFlash field={field} state={state} />
              )}
            </Inline>
          )}
        </GridItem>
        {field.kind === 'switch' && state.setupOffer === field.key && (
          <GridItem colSpan={12}>
            <SetupOffer field={field} state={state} />
          </GridItem>
        )}
      </Grid>
      {field.children?.map((child) => (
        <Fragment key={child.key}>
          <Divider />
          <RowField
            field={child}
            state={state}
            disabled={disabled || !on}
            nested
          />
        </Fragment>
      ))}
    </>
  );
};

export const VariantC: FC<VariantProps> = ({ state }) => (
  <Grid rowGap={5} columnGap={[0, 0, 5]}>
    <GridItem colSpan={[12, 12, 2]}>
      <Box
        position="sticky"
        insetBlockStart={0}
        backgroundColor={modeColors.sunken}
      >
        <Box display={['block', 'block', 'none']}>
          <ChipNav sections={sections} state={state} />
        </Box>
        <Box display={['none', 'none', 'block']} paddingBlock={2}>
          <SideNav sections={sections} state={state} />
        </Box>
      </Box>
    </GridItem>
    <GridItem colSpan={[12, 12, 10]}>
      <Stack gap={7}>
        {sections.map((section) => {
          const locked = lockedOf(section, state);
          return (
            <Stack key={section.id} gap={2} id={section.id} asChild>
              <section aria-labelledby={`${section.id}-c`}>
                <Stack gap={1}>
                  <Heading level={2} id={`${section.id}-c`}>
                    {section.title}
                  </Heading>
                  <Text tag="p" fontSize="small" color="muted">
                    {section.description}
                  </Text>
                  <HowThisWorks section={section} />
                  {locked && <RepositoryNotice />}
                </Stack>
                {section.id === 'references' ? (
                  <ReferenceRows state={state} />
                ) : (
                  <Box
                    borderWidth="thin"
                    borderStyle="solid"
                    borderColor={{ light: 'neutral-200', dark: 'neutral-800' }}
                    borderRadius={2}
                    paddingInline={3}
                    backgroundColor={modeColors.raised}
                  >
                    {section.id === 'general' && (
                      <Box paddingBlock={3}>
                        <StylePicker />
                      </Box>
                    )}
                    {section.groups.map((group, groupIndex) => (
                      <Fragment key={group.title ?? groupIndex}>
                        {group.title && (
                          <Box paddingBlockStart={4}>
                            <Text
                              tag="p"
                              fontSize="small"
                              fontWeight="bold"
                              textTransform="uppercase"
                              letterSpacing="wide"
                              color="muted"
                            >
                              {group.title}
                            </Text>
                          </Box>
                        )}
                        {group.fields.map((field, index) => (
                          <Fragment key={field.key}>
                            {(index > 0 || groupIndex > 0) && <Divider />}
                            <RowField
                              field={field}
                              state={state}
                              disabled={locked}
                            />
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </Box>
                )}
                {section.id === 'general' && <DangerZone />}
                {state.dirty(section) && (
                  <Box
                    position="sticky"
                    insetBlockEnd={0}
                    backgroundColor={modeColors.primarySubtle}
                    borderRadius={2}
                    padding={2}
                    boxShadow={2}
                  >
                    <Inline gap={3} alignX="between" alignY="center">
                      <Text tag="span" fontSize="small">
                        {section.title} has unsaved changes
                      </Text>
                      <SectionActions section={section} state={state} />
                    </Inline>
                  </Box>
                )}
              </section>
            </Stack>
          );
        })}
      </Stack>
    </GridItem>
  </Grid>
);
