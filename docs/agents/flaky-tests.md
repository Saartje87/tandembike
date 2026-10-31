# Flaky component tests

Read this before fixing a flaky test or writing a test for an optimistic save that can be refused.

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

## Proving the fix

1. **Mutation check:** break only the revert and confirm the refusal test goes red, then restore the component. Keep the optimistic display working: for example, keep `useOptimistic` and also store the refused value in a `useState` that the component renders instead. A broader break, such as swapping `useOptimistic` for `useState`, also fails the "shows at once" tests. Those leave their save Promise unresolved, and React then holds every later transition in the file, so the results of the other tests mean nothing.
2. **Repeat runs:** `npx vitest run <file> --repeats 50` runs every test in the file 50 times in one process; the summary still counts each test once. For a timing flake, also loop separate runs under CPU load, and stop only the load processes you started:

   ```sh
   for c in 1 2 3 4 5 6; do yes > /dev/null & done
   for i in $(seq 50); do npx vitest run <file> > /dev/null 2>&1 || echo "run $i failed"; done
   kill $(jobs -p)
   ```
