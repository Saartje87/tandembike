# Feedback

Use feedback components to communicate status without changing the meaning of
the underlying action or form control.

## `Alert`

Use an alert for a message that needs attention, such as a form or request
error. It renders with `role="alert"`, so screen readers announce it when it
appears. It has no `open` prop: render it conditionally to show or hide it.
Pass `onRequestClose` to add a dismiss button.

```tsx
import { Alert } from '@blockle/blocks';

{
  hasError && (
    <Alert intent="error" onRequestClose={() => setHasError(false)}>
      Something went wrong.
    </Alert>
  );
}
```

Use an appropriate intent for the message and keep the content specific. Do
not use an alert for routine success feedback that does not need to interrupt
the user's flow.

## Loading and progress

- **`Progress`** is for measurable, determinate work. Supply its numeric
  `value`; associate it with a visible label using `aria-labelledby` when
  possible.
- **`Spinner`** is for indeterminate work when the completion amount is not
  known. Its `size` and `color` variants control its presentation.
- **`Skeleton`** is a placeholder for content whose shape is known while it
  loads. Use it when preserving the page's approximate layout is more helpful
  than a generic spinner.

Avoid showing multiple competing loading indicators for the same operation.
When loading affects an action, also communicate the action's state in its
label or disabled state.

## `ToastProvider`, `useToast`, and `ToastProps`

Use toast notifications for brief, non-blocking feedback that does not require
the user to respond immediately. Place `ToastProvider` high enough in a Client
Component tree to cover the screens that need notifications, then call
`useToast` from a descendant. Use an appropriate intent and concise message.
The supported intents are `info`, `success`, `warning`, and `error`.

```tsx
'use client';

import { useToast } from '@blockle/blocks';

function SaveButton() {
  const { showToast } = useToast();

  return (
    <button
      onClick={() => {
        showToast({
          children: 'Saved',
          intent: 'success',
          duration: 3000,
        });
      }}
    >
      Save
    </button>
  );
}
```

Wrap the component that calls `useToast` in `ToastProvider`:

```tsx
import { ToastProvider } from '@blockle/blocks';

<ToastProvider>
  <SaveButton />
</ToastProvider>;
```

The hook returns `showToast` and `removeToast(id)`. `showToast` accepts
`ToastProps`, which includes `children`, `intent`, `duration`, and an optional
`id`. The `duration` is in milliseconds; use `0` for a persistent toast and
remove it explicitly with `removeToast(id)` when needed.

Use `Alert` instead when the message belongs inline with content or needs to
remain visible until dismissed. Do not put essential instructions only in a
toast.

`ToastProvider` currently renders notifications at the bottom of the screen.
Although its public props type includes `position`, the current implementation
does not apply that prop; do not rely on it to change placement.

For installation and theme setup, see [Providers](./providers.md).
