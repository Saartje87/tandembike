# Navigation

## `Link`

Use `Link` for navigation to another page or location. It supports ordinary
anchor props such as `href`, an `intent` of `primary` (the default), `neutral`
or `inherit` (the surrounding text's colour and weight), and the `underline`
option.

```tsx
import { Link } from '@blockle/blocks';

<Link href="/settings" intent="primary" underline>
  Settings
</Link>;
```

In Next.js, compose with the framework's `Link` using `asChild` so navigation
retains link semantics and Next.js behavior:

```tsx
import NextLink from 'next/link';
import { Link } from '@blockle/blocks';

<Link asChild>
  <NextLink href="/settings">Settings</NextLink>
</Link>;
```

In this app use [`AppLink`](../../src/components/app-link/app-link.tsx),
which does this inside a Client Component. Do not build the `Link asChild` +
`NextLink` pair in a Server Component. Inside a Suspense boundary that streams
in later, such as a list read with `use(promise)`, the `NextLink` reaches
`asChild` as a lazy element. Blocks before 3.3.0 rendered nothing for it, so
the server HTML had no link and hydration failed (T419, T522, fixed in 3.3.0).
`AppLink` stays the one way to build the pair in this app.

Links to files served by route handlers (not pages), such as
`/attachment/<id>`, use a plain Blocks `Link`, not `AppLink`: Next's `Link`
prefetches in-viewport hrefs in production and would download every file.

Use `Button` for an action and `Link` for navigation. Link text should make
the destination understandable in context.

## `Tabs`

Checked against `@blockle/blocks-react` 3.3.1. `Tabs` shows one panel of
several. A `TabList` holds the `Tab`s and draws a moving indicator under the
selected one; each `Tab` has a `TabPanel` with the same `value`.

```tsx
import { Tab, TabList, TabPanel, Tabs } from '@blockle/blocks';

<Tabs value={selected} onValueChange={setSelected}>
  <TabList aria-label="Conversations">
    <Tab value="a">First</Tab>
    <Tab value="b" endSlot={<IconButton aria-label="Close First" ... />}>
      Second
    </Tab>
  </TabList>
  <TabPanel value="a">...</TabPanel>
  <TabPanel value="b">...</TabPanel>
</Tabs>;
```

- Selection is controlled with `value` and `onValueChange`, or uncontrolled
  with `defaultValue`. Values are strings. A `Tab` needs `value`.
- A `Tab` is a `button` with `role="tab"`. Only the selected tab is in the Tab
  order; arrow keys, Home and End move between tabs. `startSlot` and `endSlot`
  hold content before and after the tab, such as a status dot or a close
  `IconButton`, outside the tab button itself.
- `TabList` scrolls sideways when the tabs overflow. Name it with `aria-label`.
- A `TabPanel` stays mounted while inactive, hidden with `hidden`, so its state
  (a typed draft, a scroll position) survives a tab switch. Render its children
  conditionally to mount them only while selected.
- Tab and panel ids come from `Tabs` and the values; do not set them yourself.

## `TabNav`

Route tabs: a `nav` around links that look like `Tabs`, with the same moving
indicator. It has no tab roles and no arrow-key handling; the links are plain
links in the Tab order.

```tsx
import { Tab, TabNav } from '@blockle/blocks';

<TabNav aria-label="Project">
  <Tab asChild current={path === backlog}>
    <AppLink href={backlog}>Backlog</AppLink>
  </Tab>
</TabNav>;
```

- Each `Tab` is a link: an `a` by default, or the child element with
  `asChild`. `current` sets `aria-current="page"` and moves the indicator.
- `startSlot` and `endSlot` hold a badge or icon beside the label.
- Name the `TabNav` with `aria-label` when a page has several.
