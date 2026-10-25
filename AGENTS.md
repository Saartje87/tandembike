<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Coding guidelines

### UI: use `@blockle/blocks`

- Before writing or changing any `.tsx`, read `docs/components/README.md` and the guide for what you are building: `forms.md` (inputs, Textarea, Label), `layout.md` (Stack, Inline, Grid, `asChild`), `typography.md` (Text, Heading), `styling.md` (Box props, atoms, `vars` tokens, breakpoints).
- Build UI from `@blockle/blocks` components first.
- If the docs and the installed types (`node_modules/@blockle/blocks*/dist`) disagree, the types win. Fix the docs in the same change.
- Prefer atom props (`Box`, `Text`, `Heading`, `Stack`, `Inline`) over new `.css.ts` classes; see `docs/components/styling.md`. Only fall back to plain HTML plus a vanilla-extract `.css.ts` file when Blocks has no equivalent or atoms cannot express the style. Style with `vars` tokens from `@blockle/blocks`; no hard-coded colours or spacing, no inline `style`.
- In `.css.ts` files use logical CSS properties (`inlineSize`, `paddingBlock`, `marginInline`, `borderInlineStart`), not physical ones (`width`, `padding-top`, `border-left`).
- When upgrading `@blockle/blocks`, check `docs/` against the new package's types and atoms and update them in the same change.
- Blocks feedback: while working, note friction with Blocks, such as a missing component, prop or atom, a workaround that needed custom CSS, an inconsistent API, or a docs gap. At the end of the task, record each item in `docs/blocks-feedback.md`: extend the existing proposal when one covers it, otherwise add a new numbered proposal in the file's format (problem, repro, expected, question), with the workaround you used. Check each claim against the installed types first. Then list what you recorded in a short "Blocks feedback" section of your reply. Skip both when there was nothing. Leave the library and its issue tracker alone unless asked.
- Links: use the `AppLink` component (`src/components/app-link/app-link.tsx`), never `next/link` directly.

### Components

- Declare every React component as a typed arrow function: `export const Foo: FC<FooProps> = ({ a }) => ...`, or `FC` when it takes no props. Import `type FC` from `react`. Do not use `function Foo()` declarations or inline-annotated props.
- Define props as a named `type FooProps = { ... }` above the component (or reuse the library's props type). This applies to pages and layouts too: `const Page: FC = ...; export default Page;`.
- Plain helper functions that are not components (e.g. `parse`) stay as normal functions.

### Forms

- Build every form with `react-hook-form`: `useForm` with `defaultValues`, `register` for fields, `handleSubmit` for submit, and `formState.isSubmitting` for pending state. Show a Server Action's refusal with `setError`: on the field it names, or on `'root.server'` when it names none. Example: `src/components/rename-project-inline-edit/rename-project-inline-edit.tsx`.
- A form that saves optimistically and closes on submit does not use `isSubmitting`: the optimistic value is its pending state, and a refusal reopens the form and shows the reason with `setError`. Keep `useForm` in a component that stays mounted, so the draft outlives the form. Example: the add field in `src/components/label-editor/label-editor.tsx`.

### Structure

This repo is one app: a local ticket tracker. Read `GLOSSARY.md` for the domain language (Project, Ticket, Status, User, Agent) and `docs/adr/` for the decisions behind the design before changing behaviour.

- `src/app/`: pages, layouts, Server Actions and route handlers, including the MCP route (`src/app/api/mcp/`) and the events route (`src/app/api/events/`). Give each page a `metadata` title.
- URLs: a single item gets a singular segment, a collection a plural one (`/projects`, `/project/3`, `/project/3/cycle/7`). A Ticket has no page of its own: it opens as a drawer through `?ticket=12` on the Board it is shown over (`/project/3?ticket=12`), and `/ticket/12` opens it over its own Board (ADR 0013). Build every path, and every `revalidatePath` pattern, with `src/app/lib/paths.ts`; never write one out by hand.
- `src/tickets/`: the Tickets module, the only code that reads or writes Projects and Tickets, with its tests next to it.
- `src/db/`: the Drizzle schema, migrations and database connection.
- `src/components/`: UI components.
- Every component lives in its own folder, grouped by domain/feature: `components/<name>/{<name>.tsx, <name>.css.ts, <name>.test.tsx}`. Import the component file directly, without the file extension (e.g. `../app-link/app-link`).
- No barrel files: never add `index.ts` files that re-export from other modules.
- Always use relative imports without file extensions (`../../lib/format-path`), including across feature folders. The `@/` alias is not used.

### Tests

- Every new or changed behaviour gets a test in the same change, written test-first (see the `tdd` skill). Pure logic: unit tests next to the code they cover (e.g. `src/tickets/`). Components: render and behaviour tests with Testing Library via `renderWithTheme` from `src/test/render.tsx`.
- Tickets module tests: start the file with `// @vitest-environment node` and build a fresh module per test with `createTestTickets()` from `src/test/tickets.ts` (in-memory SQLite, real migrations). Assert errors with `errorFrom()` from the same file. Test through the module's public functions, never the tables.
- Component tests mock Server Actions (`vi.mock('../../app/projects/actions', ...)`) and `next/navigation` (with `mockRouter()` from `src/test/navigation.ts`) at the module boundary.
- Exempt: pure styling or copy changes.
- Test runner is Vitest (`npm test`). Do not add a second runner.

### Git workflow

The remote `origin` is a public GitHub repo; CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests on every PR and every push to `main`.

- Do each Ticket on its own branch off `main`, named `ticket-<number>-<slug>` (e.g. `ticket-23-remove-blocker-missing`). An Epic is one unit: claim it once, work its children in Blocker order on one branch named after the Epic, and open one PR for it; see "Working an Epic" in `docs/agents/issue-tracker.md`.
- Push that branch and open a PR with `gh` freely; write the body with the `pr` skill.
- Changes reach `main` through a merged PR. Ask the User before merging a PR or pushing to `main`.
- Refer to a Ticket in commits and PRs as `Ticket #23`, without GitHub closing keywords (`Closes`, `Fixes`): GitHub resolves those numbers to its own issues, not Tickets.
- When a Ticket's work is done, see `docs/agents/issue-tracker.md` for when to move it to `Done`.

### Before finishing

Run `npm run check` (Biome, typecheck, tests). It must pass. The pre-commit hook runs Biome on staged files and the typecheck; CI runs all three on the PR.

### Process feedback

While working with Tickets, the Tandembike MCP tools, the agent docs (`docs/agents/`, `AGENTS.md`, `CLAUDE.md`) or the User's request itself, note friction you actually hit: a missing tool or parameter, an unclear error, docs that contradict each other, a vague Ticket or missing acceptance criteria, an ambiguous request. At the end of the task, list each item in a short "Process feedback" section of your reply: what happened and what you would change. Raise an item mid-task only when it blocks the work or forces a guess. Suggest only: create a Ticket or edit a doc for an item once the User approves it. Leave the section out when nothing came up.
