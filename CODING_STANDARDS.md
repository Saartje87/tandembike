# Coding standards

Judgement calls for review. `AGENTS.md` holds the conventions every change follows. Biome, the typecheck and the tests enforce the mechanical rules.

## Tests

- **Restored state after a refusal:** when a test awaits a refusal message, check the restored optimistic value inside `waitFor` or `findBy`, never with a synchronous `getBy` straight after. React shows the error and the restored value in separate updates, so a slow run can catch the moment between them (T108, T200, T521). See `docs/agents/flaky-tests.md`.
