# Flaky component tests

Read this before fixing a flaky test, writing a test for an optimistic save that can be refused, or filing a bug on a behaviour seen only in a jsdom test.

## The usual cause: checking restored state too early

A component that saves optimistically shows the new value inside `startTransition`, then calls `setError` after the Server Action's `await`. React shows the error in one update and puts the old value back in a later one, when the transition ends. A test that waits for the message with `findBy` and then checks the old value with a synchronous `getBy` passes on a fast machine and fails under load.

Check the restored value inside `waitFor`:

```tsx
expect(await screen.findByText('Epic T8 is archived.')).toBeInTheDocument();
await waitFor(() => {
  expect(screen.getByText('None')).toBeInTheDocument();
});
```

Examples: T200 (`acceptance-criteria-editor.test.tsx`), T521 (`ticket-epic.test.tsx`).

## Clicking a control the transition still disables

A Server Action's result can open a step, such as a confirm dialog, before its transition ends: state set after the `await` commits in its own update, and `isPending` turns false in a later one. Until then a button disabled with `pending` is on screen but ignores clicks, so a test that clicks it as soon as `findBy` resolves fails under load. Wait for it to be enabled, and check the call inside `waitFor`:

```tsx
const mergedAnyway = within(dialog).getByRole('button', {
  name: 'Merged anyway',
});
await waitFor(() => expect(mergedAnyway).toBeEnabled());
await userEvent.click(mergedAnyway);
await waitFor(() =>
  expect(completeTicket).toHaveBeenLastCalledWith({
    number: 4,
    confirmed: true,
  }),
);
```

Example: T1314 (`ticket-drawer.test.tsx`).

## An interaction ignored only in jsdom: an unflushed render

**Symptom:** an interaction seems to do nothing in a jsdom test, such as Escape not closing a Drawer, but works in a real browser. It usually fails every run, not only under load.

**Cause:** a synchronous `render()`, or an update the test did not await, left a React update unflushed. A layout effect that schedules a store update while a child below a `Suspense` boundary is suspended is one case: the component never re-renders, so it keeps acting on its first render's state.

**Fix:** flush the update before the test interacts. Render inside an async `act`, as `renderPage` in `src/test/render.tsx` does; an update that follows an interaction is checked inside `waitFor`, as in the sections above:

```tsx
await act(async () => {
  renderWithTheme(
    <TicketDrawerShell number={4} boardPath="/project/1">
      {suspendedBody}
    </TicketDrawerShell>,
  );
});
await userEvent.keyboard('{Escape}');
```

Example: T674, filed on Blocks for this and closed as a test artifact; the fix is in `ticket-drawer-shell.test.tsx`. Fix the test; a library bug needs a real browser to reproduce it ([`browser-checks.md`](browser-checks.md)).

## Proving the fix

1. **Mutation check:** break only the revert and confirm the refusal test goes red, then restore the component. Keep the optimistic display working: for example, keep `useOptimistic` and also store the refused value in a `useState` that the component renders instead. A broader break, such as swapping `useOptimistic` for `useState`, also fails the "shows at once" tests. Those leave their save Promise unresolved, and React then holds every later transition in the file, so the results of the other tests mean nothing.
2. **Repeat runs:** `npx vitest run <file> --repeats 50` runs every test in the file 50 times in one process; the summary still counts each test once. For a timing flake, also loop separate runs under CPU load, and stop only the load processes you started:

   ```sh
   for c in 1 2 3 4 5 6; do yes > /dev/null & done
   for i in $(seq 50); do npx vitest run <file> > /dev/null 2>&1 || echo "run $i failed"; done
   kill $(jobs -p)
   ```
