# Accessibility

## `VisuallyHidden`

Use `VisuallyHidden` for text that should be available to assistive technology
but not displayed visually. It renders a visually hidden `span`; it is not a
replacement for a visible label when one is appropriate.

It takes HTML attributes, so it can also be a live region: keep a
`<VisuallyHidden role="status">` mounted, empty until there is something to
announce, and set its text to announce it (`copy-ticket-number.tsx`). Blocks
has no live-region component (`docs/blocks-feedback.md`, 24).

```tsx
import { VisuallyHidden } from "@blockle/blocks";

<button>
  <SearchIcon />
  <VisuallyHidden>Search</VisuallyHidden>
</button>;
```

Use meaningful text that describes the control or adds context. Do not rely on
a decorative icon alone to communicate an action.

