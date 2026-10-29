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

Use `Button` for an action and `Link` for navigation. Link text should make
the destination understandable in context.
