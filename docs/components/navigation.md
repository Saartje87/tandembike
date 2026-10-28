# Navigation

## `Link`

Use `Link` for navigation to another page or location. It supports ordinary
anchor props such as `href`, the `primary`, `secondary`, and `inherit`
variants, and the `underline` option.

```tsx
import { Link } from '@blockle/blocks';

<Link href="/settings" variant="primary" underline>
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
