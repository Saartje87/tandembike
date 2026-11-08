# Does an independent review catch what the inline review misses? (T1179)

Question: before building the Review stage (Epic T1093), would a second review in a fresh Conversation, not anchored on the run that wrote the code, find real defects that the Start run's inline `code-review` let through? The rule set in T1093: one real miss across five PRs means build the stage; none means park the Epic. The User makes that call; this file gives the evidence and a proposed classification for each finding. It changes no app code.

Date: 2026-11-08.

## Answer in short

- **No real misses proposed.** Across five merged PRs the independent reviews raised 64 findings. On verification against the code, the proposal is **0 real misses, 43 nits and 21 false positives**.
- **Two nits come closest to a real miss** and are worth the User's judgement:
  - PR #159 (T1149): a long label can squeeze a Board row's title to nothing. The end slot has `flexShrink={0}`, the row no longer wraps, and label tags never truncate. That goes against the spec's "the title keeps its space". Typical labels are short, and nobody rendered it to confirm. Still present on `main` (`cockpit.tsx` line 348).
  - PR #160 (T1100): no test shows that a refused answer submit keeps the answers. The code is right, since answers are deleted only on success. The criterion asks for no test, but AGENTS.md says every behaviour gets one.
- **Cost: $0.59 to $0.81 per review, $3.51 for all five.** That counts the reviewing agent (Opus 5.5) and code-review's two sub-agents (Sonnet 5.5). It also includes the verification and classification step, which a Review run would not do. It leaves out a Review run's fixed brief, the Ticket comment and the merge. The brief alone was 17–30% of a Start run's cost in `start-run-cost.md`, so a real Review run would cost more, likely around $1.
- **What the reviews found was mostly the same kind of thing the inline review is there to filter:** judgement-call smells (naming, small duplication, placement), scope notes that turned out to be deliberate and explained on the Ticket, and claims that fell apart on reading the code or the spec.

## Method

- **PRs.** The five most recent merged PRs that touch `src/` as of 2026-11-08: #162, #161, #160, #159 and #158. Docs-only PRs (#163, #154, #153, #152) were skipped. All five are Agent-run PRs of the kind the `implement` skill produces, whose step 4 runs `code-review` inline before the merge. The PRs don't record whether Tandembike started the run or a terminal session did, so "Start-run PR" here means a PR from an `implement` run.
- **Fresh context.** Each review ran as its own background agent, started from a fixed brief with no knowledge of the original run's transcript. It created a detached worktree at the PR's head commit and called the `code-review` skill. The fixed point was the PR's merge-base with `main` (`git merge-base <head> <merge commit>^1`) and the spec was the PR's Ticket, read with `get_ticket` (an Epic with its children). Then, still in that agent, each finding was checked against the code at the head commit and classified:
  - **real miss**: a real defect or a breach of a documented repo standard that shipped;
  - **nit**: true but minor, or a judgement call such as a baseline smell;
  - **false positive**: wrong on inspection.
    For each real or borderline item, the agent also checked whether `origin/main` has fixed it since.
- **Reviewing the merged state.** Each PR was reviewed as merged, so anything the inline review caught and the run fixed is already in it. Any real finding is therefore a miss of the inline review.
- **Cost.** Summed from the agents' session logs, counting usage once per message id, at the prices in `start-run-cost.md` (Opus 5.5: $4 in, $20 out, $0.20 cache read, $5/$8 cache write; Sonnet 5.5: $2, $10, $0.10, $2.50/$4).

## Results

| PR        | Ticket                             | Diff                                  | Findings | Real miss |    Nit | False positive |      Cost |       Time |
| --------- | ---------------------------------- | ------------------------------------- | -------: | --------: | -----: | -------------: | --------: | ---------: |
| #162      | T1092 (Epic: Cycle end)            | 43 files, +3336/-87 (≈2400 generated) |       15 |         0 |     11 |              4 |     $0.81 | 2 min 24 s |
| #161      | T569 (paste Attachments)           | 4 files, +443/-17                     |       12 |         0 |      7 |              5 |     $0.69 |      2 min |
| #160      | T1100 (Epic: mount selected tab)   | 10 files, +570/-50                    |       16 |         0 |     11 |              5 |     $0.76 |  2 min 8 s |
| #159      | T1149 (labels on Board rows)       | 8 files, +258/-13                     |       12 |         0 |      8 |              4 |     $0.66 |  2 min 2 s |
| #158      | T1144 (child built on Epic branch) | 5 files, +250/-8                      |        9 |         0 |      6 |              3 |     $0.59 | 1 min 29 s |
| **Total** |                                    |                                       |   **64** |     **0** | **43** |         **21** | **$3.51** |            |

The finding counts are per verified row. A few raw findings that two axes both raised are merged into one row.

### PR #162 (T1092, Cycle end)

Standards found no hard violations. Spec found no missing acceptance criterion.

| Finding                                                                                                                       | Classification | Reason                                                                                                                                         | Fixed on main since? |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Banner uses `Alert intent="success"`, but `docs/components/feedback.md` says not to use an alert for routine success feedback | nit            | A persistent banner with actions that needs attention. The spec asked for "an `Alert` or similar". The rule targets transient success feedback | n/a                  |
| Archive uses `window.confirm`, not a Blocks `Dialog`                                                                          | false positive | No documented rule. The spec requires reusing the header's confirmation                                                                        | n/a                  |
| Duplicated confirm → archive → navigate flow in two components                                                                | nit            | About 6 lines. The message is shared                                                                                                           | n/a                  |
| Retro lookup duplicated in the UI (`retroOf` on the server)                                                                   | nit            | Covers Retros started since the page loaded. Small                                                                                             | n/a                  |
| `run` / `retroAction` names                                                                                                   | nit            | Local helpers with an explaining comment                                                                                                       | n/a                  |
| `retroCycle?: … \| null` has two absent states                                                                                | nit            | Matches how other optional brief fields are typed                                                                                              | n/a                  |
| Intent if-cascade in `Conversations.start`                                                                                    | nit            | Two branches. Too early to abstract                                                                                                            | n/a                  |
| `startRetro` is a Middle Man                                                                                                  | false positive | The repo's Server Action pattern                                                                                                               | n/a                  |
| Doc comment on `setProjectAgentCommands` (`src/app/projects/actions.ts:205`) names only the Triage and Start buttons          | nit            | The field list in the same comment names `retroCommand`                                                                                        | no                   |
| Settings copy omits the Retro command                                                                                         | false positive | `settings/page.tsx:72-77` names it                                                                                                             | n/a                  |
| No unique index on `retro_cycle_id`                                                                                           | nit            | Synchronous SQLite in one process, with no await between check and insert. Hardening only                                                      | no                   |
| Live update unverified                                                                                                        | false positive | No defect shown. The banner refreshes on every change event like the rest of the Board                                                         | n/a                  |
| After archiving, the Retro is reachable only through the Conversation list                                                    | nit            | Meets "stay reachable"                                                                                                                         | n/a                  |
| A Retro skips the parallel-run limit                                                                                          | nit            | The spec is silent. Retros are started by the User, like Ask and Setup                                                                         | n/a                  |
| `start` hoisted to a closure                                                                                                  | nit            | Refactor needed by `startRetro`. No behaviour change                                                                                           | n/a                  |

### PR #161 (T569, paste files as Attachments)

| Finding                                                                 | Classification | Reason                                                                                  | Fixed on main since? |
| ----------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------- | -------------------- |
| Paste handler coupled to the drawer's DOM (`dialog[open]`)              | nit            | True, and it works today: Blocks Dialog and Drawer render inline as a native `<dialog>` | n/a                  |
| `pastedFiles` name                                                      | nit            | Naming taste. Has a doc comment                                                         | n/a                  |
| Module name                                                             | nit            | The reviewer called it fine                                                             | n/a                  |
| Helper placed in `src/tickets/`                                         | false positive | Follows precedent                                                                       | n/a                  |
| Two further Standards items                                             | false positive | Reported as non-issues                                                                  | n/a                  |
| Paste onto a focused `<select>` is ignored, which the spec doesn't list | nit            | A harmless widening                                                                     | n/a                  |
| Paste outside the drawer is left to the browser                         | nit            | Needed because the listener is on the document. Tested                                  | n/a                  |
| Uncommon image subtypes become the extension (`.x-icon`)                | nit            | Clipboard images are png or jpeg in practice                                            | n/a                  |
| The listener never checks the drawer is open                            | false positive | A closed drawer renders nothing, so no listener is mounted                              | n/a                  |
| `add` has no catch, so a throwing Server Action shows no refusal        | nit            | Real but older than this PR                                                             | no                   |
| Mount-time `closest('dialog')`                                          | false positive | The section always renders inside the drawer                                            | n/a                  |
| `documentElement` as paste target                                       | false positive | Paste events do not target `<html>` in practice                                         | n/a                  |

### PR #160 (T1100, mount only the selected Conversation tab)

| Finding                                                | Classification   | Reason                                                                                        | Fixed on main since? |
| ------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------- | -------------------- |
| Scroll position lost on switch                         | false positive   | The spec decides "open at newest" and puts scroll keeping out of scope                        | n/a                  |
| `kept.of()` writes during render                       | nit              | Idempotent. Orphans are pruned on every change                                                | n/a                  |
| Kept object mutated on purpose                         | nit              | Deliberate and documented                                                                     | n/a                  |
| `structuredClone(current) as Values` cast              | nit              | Partial values are guarded downstream                                                         | n/a                  |
| Subtle load-race guard                                 | nit              | Traced and correct. Tested                                                                    | n/a                  |
| `KeptConversationProvider` alias                       | nit              | Cosmetic                                                                                      | n/a                  |
| Duplicated conditional spread                          | nit              | A repo-wide pattern for `exactOptionalPropertyTypes`                                          | n/a                  |
| Leaf components import from the provider folder        | nit              | Design taste. No rule                                                                         | n/a                  |
| `of()` getter that also writes                         | nit              | Documented                                                                                    | n/a                  |
| No unit tests for `kept-conversations.ts`              | nit              | Covered through the provider, the spec's named seam                                           | n/a                  |
| No test that a refused answer submit keeps the answers | nit (borderline) | The criterion asks for no test, but AGENTS.md wants a test per behaviour. The code is correct | no                   |
| No test for "newest message on switch"                 | false positive   | The spec says the existing behaviour covers it                                                | n/a                  |
| No new arrow, Home or End key test                     | false positive   | Wiring unchanged and already tested                                                           | n/a                  |
| Answers kept for a question settled while hidden       | nit              | Never shown again, and dropped on close                                                       | n/a                  |
| Briefly stale transcript                               | false positive   | What the spec asked for                                                                       | n/a                  |
| Send clears text typed while in flight                 | false positive   | Behaviour from before this PR                                                                 | n/a                  |

### PR #159 (T1149, labels on Board rows)

| Finding                                              | Classification        | Reason                                                          | Fixed on main since?        |
| ---------------------------------------------------- | --------------------- | --------------------------------------------------------------- | --------------------------- |
| `aria-label` on the `<li>` of the +N tag             | nit                   | ARIA allows it. A `VisuallyHidden` span would be more robust    | no                          |
| Single-use exported `wontfix` constant               | nit                   | Mirrors `readyForAgent`                                         | n/a                         |
| `isRowLabel` in the Tickets module                   | nit                   | Placement taste. Sits beside `isTriageStateLabel`               | n/a                         |
| `rowOf` exported                                     | nit                   | Removes a duplicate for Archived                                | n/a                         |
| `max === undefined` checked twice in `LabelList`     | nit                   | Trivial                                                         | n/a                         |
| Repeated test mock setup                             | nit                   | Matches the file's style                                        | n/a                         |
| End-slot wrappers always rendered, nested in Intake  | nit                   | Harmless markup                                                 | n/a                         |
| `max` prop on `LabelList` as scope creep             | false positive        | The spec asks for +N overflow                                   | n/a                         |
| `rowOf` export and `wontfix` constant as scope creep | false positive        | Needed or allowed by the spec                                   | n/a                         |
| Row `nowrap` affects every row                       | false positive        | The spec requires it                                            | n/a                         |
| A long label can squeeze the title to nothing        | nit (borderline real) | True in code. Typical labels are short. Not rendered to confirm | no (`cockpit.tsx` line 348) |
| Case-sensitive label filter                          | false positive        | Labels are stored lower-cased                                   | n/a                         |

### PR #158 (T1144, a child built on its Epic's branch)

| Finding                                                       | Classification | Reason                                                       | Fixed on main since? |
| ------------------------------------------------------------- | -------------- | ------------------------------------------------------------ | -------------------- |
| GLOSSARY needs a "built" entry                                | false positive | It defines none of the other child states                    | n/a                  |
| The "done or built" rule sits in the view, not in `cockpitOf` | nit            | A one-line filter                                            | n/a                  |
| `ownRun` name                                                 | nit            | Commented in place                                           | n/a                  |
| Repeated switches on `EpicChildState`                         | false positive | Compiler-checked maps, the repo pattern                      | n/a                  |
| Duplicated test fixtures across two files                     | nit            | Harmless                                                     | n/a                  |
| Built and done differ only by colour in the collapsed bar     | nit            | True of every state. The opened list shows the state as text | n/a                  |
| A child's own run outranks built (scope creep)                | nit            | Deliberate, explained on T1144, tested                       | n/a                  |
| aria-label wording change                                     | false positive | Required by AC 3                                             | n/a                  |
| An all-checked child in its own Review section shows built    | nit            | Barely arises: an Epic gets one PR                           | n/a                  |

## Limits

- **Five PRs is a small sample.** All five came from runs whose inline review had already been through `code-review`. Several of them (#162, #160) also had a fix-up commit from that review.
- **The classification is the agents' proposal.** The User decides which findings count as real misses.
- **Same model family as the inline review.** The reviewers ran Opus 5.5 with Sonnet 5.5 sub-agents, as the inline review does. A fresh context removes the anchoring but not the model's blind spots.
