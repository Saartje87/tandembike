'use client';

import {
  Box,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tooltip,
} from '@blockle/blocks';
import { useSearchParams } from 'next/navigation';
import {
  createContext,
  type FC,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/** The sections of a Project's Settings, in tab order. */
export const settingsSections = [
  { id: 'general', title: 'General' },
  { id: 'repository', title: 'Repository' },
  { id: 'agent', title: 'Agent' },
  { id: 'automation', title: 'Automation' },
  { id: 'commands', title: 'Commands' },
  { id: 'references', title: 'References' },
] as const;

export type SettingsSectionId = (typeof settingsSections)[number]['id'];

const isSectionId = (value: string | null): value is SettingsSectionId =>
  settingsSections.some(({ id }) => id === value);

type SettingsShell = {
  /** Opens a section's tab, scrolled to the field with id `anchor` if given. */
  select: (section: SettingsSectionId, anchor?: string) => void;
  /** Marks whether a section holds unsaved edits. */
  setDirty: (section: SettingsSectionId, dirty: boolean) => void;
};

const SettingsShellContext = createContext<SettingsShell>({
  select: () => {},
  setDirty: () => {},
});

/** The Settings page's tabs, as the sections inside them see them. */
export const useSettingsShell = (): SettingsShell =>
  useContext(SettingsShellContext);

/** The orange dot of a tab whose section holds unsaved edits. */
export const UnsavedDot: FC = () => (
  <Tooltip content="Unsaved changes">
    <Box
      asChild
      display="inline-block"
      borderRadius="full"
      backgroundColor="warning-500"
      padding={1}
    >
      <span role="img" aria-label="Unsaved changes" />
    </Box>
  </Tooltip>
);

export type ProjectSettingsProps = {
  /** Whether the Project has a repository path saved. */
  hasRepository: boolean;
  /** Each section's content: its card, built by the section's own form. */
  panels: Record<SettingsSectionId, ReactNode>;
};

/** The section holding the element with id `anchor`, if any. */
const sectionOfAnchor = (anchor: string): SettingsSectionId | null => {
  const owner = document
    .getElementById(anchor)
    ?.closest('[data-settings-section]')
    ?.getAttribute('data-settings-section');
  return owner && isSectionId(owner) ? owner : null;
};

/**
 * A Project's Settings as one tab per section (T1430). The selected tab
 * lives in `?section=`; without one it opens on General, or on Repository
 * while no repository path is saved. A field anchor such as
 * `#check-command` opens the tab holding that field and scrolls to it.
 * Panels stay mounted, so unsaved edits survive a tab switch, and a tab
 * whose section has some shows an orange dot.
 */
export const ProjectSettings: FC<ProjectSettingsProps> = ({
  hasRepository,
  panels,
}) => {
  const params = useSearchParams();
  const asked = params.get('section');
  const [selected, setSelected] = useState<SettingsSectionId>(
    isSectionId(asked) ? asked : hasRepository ? 'general' : 'repository',
  );
  const [dirty, setDirtySections] = useState<
    Partial<Record<SettingsSectionId, boolean>>
  >({});
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  const select = useCallback((section: SettingsSectionId, anchor?: string) => {
    setSelected(section);
    const next = new URLSearchParams(window.location.search);
    next.set('section', section);
    const hash = anchor ? `#${anchor}` : '';
    // The native history API keeps Next's router in step without a fetch.
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}?${next}${hash}`,
    );
    if (anchor) {
      setScrollTo(anchor);
    }
  }, []);

  const setDirty = useCallback(
    (section: SettingsSectionId, isDirty: boolean) =>
      setDirtySections((current) =>
        current[section] === isDirty
          ? current
          : { ...current, [section]: isDirty },
      ),
    [],
  );

  // A field anchor, on load or when the hash changes, opens its tab.
  useEffect(() => {
    const openAnchor = () => {
      const anchor = decodeURIComponent(window.location.hash.slice(1));
      const owner = anchor ? sectionOfAnchor(anchor) : null;
      if (owner) {
        select(owner, anchor);
      }
    };
    openAnchor();
    window.addEventListener('hashchange', openAnchor);
    return () => window.removeEventListener('hashchange', openAnchor);
  }, [select]);

  // Scroll once the tab holding the field is shown.
  useEffect(() => {
    if (scrollTo) {
      document
        .getElementById(scrollTo)
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      setScrollTo(null);
    }
  }, [scrollTo]);

  const shell = useMemo(() => ({ select, setDirty }), [select, setDirty]);

  return (
    <SettingsShellContext.Provider value={shell}>
      <Tabs
        value={selected}
        onValueChange={(value) => isSectionId(value) && select(value)}
      >
        <Stack gap={4}>
          <TabList aria-label="Settings sections">
            {settingsSections.map(({ id, title }) => (
              <Tab
                key={id}
                value={id}
                endSlot={dirty[id] ? <UnsavedDot /> : null}
              >
                {title}
              </Tab>
            ))}
          </TabList>
          {settingsSections.map(({ id }) => (
            <TabPanel key={id} value={id}>
              <div data-settings-section={id}>{panels[id]}</div>
            </TabPanel>
          ))}
        </Stack>
      </Tabs>
    </SettingsShellContext.Provider>
  );
};
