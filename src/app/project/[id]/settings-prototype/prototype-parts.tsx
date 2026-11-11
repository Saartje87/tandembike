'use client';

// PROTOTYPE (T1431): controls and small pieces shared by the layout variants.
// Each variant owns its own layout.

import {
  Alert,
  Box,
  Button,
  Inline,
  Link,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@blockle/blocks';
import { type FC, useState } from 'react';

import { modeColors } from '../../../../app/lib/mode-colors';
import { ProjectStylePicker } from '../../../../components/project-style-picker/project-style-picker';
import type { Project } from '../../../../tickets/tickets';
import type { Field, PrototypeState, Section } from './prototype-state';
import * as styles from './settings-prototype.css';

type ControlProps = {
  field: Field;
  state: PrototypeState;
  id: string;
  disabled?: boolean;
};

/** The input for a field, without its label. */
export const Control: FC<ControlProps> = ({ field, state, id, disabled }) => {
  const value = state.draft[field.key];
  if (field.kind === 'switch') {
    return (
      <Switch
        id={id}
        checked={value === true}
        disabled={disabled}
        onChange={(event) => state.change(field, event.target.checked)}
      />
    );
  }
  if (field.kind === 'select') {
    return (
      <Select
        id={id}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => state.change(field, event.target.value)}
      >
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }
  if (field.kind === 'radio') {
    return (
      <Stack gap={1} role="radiogroup" aria-labelledby={id}>
        {field.options?.map((option) => (
          <Radio
            key={option.value}
            name={field.key}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => state.change(field, option.value)}
          >
            {option.label}
          </Radio>
        ))}
      </Stack>
    );
  }
  return (
    <TextInput
      id={id}
      type={field.kind === 'number' ? 'number' : 'text'}
      value={String(value)}
      placeholder={field.placeholder}
      autoComplete="off"
      disabled={disabled}
      onChange={(event) => state.change(field, event.target.value)}
    />
  );
};

/** "Saved" for a moment after a switch saves. */
export const SavedFlash: FC<{ field: Field; state: PrototypeState }> = ({
  field,
  state,
}) =>
  state.flash === field.key ? (
    <Text tag="span" fontSize="small" color="muted">
      Saved
    </Text>
  ) : null;

/** The Setup offer under the switch that triggered it. */
export const SetupOffer: FC<{ field: Field; state: PrototypeState }> = ({
  field,
  state,
}) =>
  state.setupOffer === field.key ? (
    <Alert intent="info">
      <Stack gap={2}>
        <Text tag="p" fontSize="small">
          {field.key === 'agentMode'
            ? 'Agent mode is on. Run Setup so the repository is ready for agents?'
            : 'Parallel runs are on. Run Setup to check worktrees work here?'}
        </Text>
        <Inline gap={2}>
          <Button size="small" type="button" onClick={state.dismissSetup}>
            Run Setup
          </Button>
          <Button
            size="small"
            type="button"
            variant="ghost"
            onClick={state.dismissSetup}
          >
            Not now
          </Button>
        </Inline>
      </Stack>
    </Alert>
  ) : null;

/** One line pointing at the Repository section. */
export const RepositoryNotice: FC = () => (
  <Text tag="p" fontSize="small" color="muted">
    Set a repository path first <Link href="#repository">→ Repository</Link>
  </Text>
);

/** The longer rules of a section, collapsed. */
export const HowThisWorks: FC<{ section: Section }> = ({ section }) =>
  section.help ? (
    <Box asChild>
      <details>
        <Box asChild cursor="pointer">
          <summary>
            <Text tag="span" fontSize="small" color="muted">
              How this works
            </Text>
          </summary>
        </Box>
        <Stack gap={1} paddingBlockStart={1}>
          {section.help.map((line) => (
            <Text key={line} tag="p" fontSize="small" color="muted">
              {line}
            </Text>
          ))}
        </Stack>
      </details>
    </Box>
  ) : null;

/** The unsaved-changes dot. */
export const DirtyDot: FC = () => (
  <Box
    asChild
    display="inline-block"
    borderRadius="full"
    backgroundColor="warning-500"
    padding={1}
  >
    <span role="img" aria-label="Unsaved changes" />
  </Box>
);

/** Save and Discard for a dirty section. */
export const SectionActions: FC<{
  section: Section;
  state: PrototypeState;
}> = ({ section, state }) => (
  <Inline gap={2} alignY="center">
    <Button
      size="small"
      type="button"
      variant="ghost"
      onClick={() => state.discard(section)}
    >
      Discard
    </Button>
    <Button
      size="small"
      type="button"
      loading={state.saving === section.id}
      onClick={() => state.save(section)}
    >
      Save
    </Button>
  </Inline>
);

/** The Detect button under the repository path. */
export const DetectButton: FC = () => (
  <div>
    <Button type="button" size="small" variant="ghost">
      Detect
    </Button>
  </div>
);

/** General's colour and icon picker, saving at once. */
export const StylePicker: FC = () => {
  const [style, setStyle] = useState<Pick<Project, 'color' | 'icon'>>({
    color: 'orange',
    icon: null,
  });
  return (
    <Inline gap={2} alignY="center">
      <ProjectStylePicker
        style={style}
        onPick={(pick) => setStyle((current) => ({ ...current, ...pick }))}
      />
      <Text tag="span" fontSize="small" color="muted">
        Colour and icon, saved as you pick
      </Text>
    </Inline>
  );
};

/** General's danger zone. */
export const DangerZone: FC = () => (
  <Box
    borderWidth="thin"
    borderStyle="solid"
    borderColor={modeColors.danger}
    borderRadius={2}
    padding={3}
  >
    <Inline gap={3} alignX="between" alignY="center">
      <Stack gap={1}>
        <Text tag="p" fontWeight="bold">
          Archive this Project
        </Text>
        <Text tag="p" fontSize="small" color="muted">
          It becomes read-only until you restore it.
        </Text>
      </Stack>
      <Button type="button" size="small" variant="outline" intent="danger">
        Archive
      </Button>
    </Inline>
  </Box>
);

type NavProps = {
  sections: Section[];
  state: PrototypeState;
};

/** The section links as a vertical list, for a side nav. */
export const SideNav: FC<NavProps> = ({ sections, state }) => (
  <Stack gap={1} listStyle="none" role="list" asChild>
    <ul>
      {sections.map((section) => (
        <li key={section.id}>
          <Inline gap={2} alignY="center">
            <Link href={`#${section.id}`} underline={false}>
              {section.title}
            </Link>
            {state.dirty(section) && <DirtyDot />}
          </Inline>
        </li>
      ))}
    </ul>
  </Stack>
);

/** The section links as a row of chips that scrolls sideways. */
export const ChipNav: FC<NavProps> = ({ sections, state }) => (
  <Inline
    className={styles.chipScroller}
    gap={2}
    flexWrap="nowrap"
    overflowInline="auto"
    listStyle="none"
    role="list"
    paddingBlock={2}
    asChild
  >
    <ul>
      {sections.map((section) => (
        <Box
          key={section.id}
          asChild
          borderRadius="full"
          borderWidth="thin"
          borderStyle="solid"
          borderColor={{ light: 'neutral-300', dark: 'neutral-700' }}
          paddingInline={3}
          paddingBlock={1}
          backgroundColor={modeColors.raised}
        >
          <li>
            <Inline gap={1} alignY="center" flexWrap="nowrap">
              <Link href={`#${section.id}`} underline={false}>
                <Text tag="span" fontSize="small" whiteSpace="nowrap">
                  {section.title}
                </Text>
              </Link>
              {state.dirty(section) && <DirtyDot />}
            </Inline>
          </li>
        </Box>
      ))}
    </ul>
  </Inline>
);
