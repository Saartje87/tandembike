/**
 * The icons a Project can have: a curated set of the app's Heroicons that
 * suit a Project, by asset name. A Project without one shows `folder`.
 */
export const projectIcons = [
  'folder',
  'academic-cap',
  'beaker',
  'bolt',
  'book-open',
  'briefcase',
  'bug-ant',
  'building-office',
  'building-storefront',
  'cake',
  'calendar',
  'camera',
  'chart-bar',
  'chat-bubble-left-right',
  'code-bracket',
  'command-line',
  'cpu-chip',
  'cube',
  'film',
  'fire',
  'gift',
  'globe-alt',
  'heart',
  'home',
  'light-bulb',
  'map',
  'megaphone',
  'moon',
  'musical-note',
  'paint-brush',
  'puzzle-piece',
  'rocket-launch',
  'server-stack',
  'shopping-cart',
  'sparkles',
  'star',
  'sun',
  'trophy',
  'truck',
  'wrench-screwdriver',
] as const;

export type ProjectIcon = (typeof projectIcons)[number];

/** Whether `value` is one of the Project icons, for input from outside. */
export function isProjectIcon(value: unknown): value is ProjectIcon {
  return (projectIcons as readonly unknown[]).includes(value);
}

/** The reason given for an icon outside the set. */
export const projectIconRule = 'Choose one of the Project icons.';
