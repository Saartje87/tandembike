# Independent Review runs per PR

Tandembike does not start a separate Review run, a fresh Conversation running `code-review` on each PR, between a Start run opening its PR and the merge.

## Why this is out of scope

It was proposed as phase 5 of the first software factory roadmap (Epic T1093). At the time the Start run merged its own PR, and the inline review in that same Conversation was the only review a factory PR got. The argument was that a fresh reviewer is not anchored on its own work.

The build was gated on a measurement (T1179, `docs/research/independent-review.md`): `/code-review` run in a fresh agent on the five most recent merged code PRs, with each PR's Ticket as its spec. It raised 64 findings, 43 nits and 21 false positives, and no real miss: no hard standards breach and no missing acceptance criterion. Each review cost $0.59 to $0.81, so a Review run would cost about $1 per PR.

Roadmap 2 (`docs/roadmap/software-factory-2.md`, T1191) then removed the premise. The User is the **Merge gate**: every reviewed PR with green checks waits for their Approve merge. Before that, the Start run still reviews its own PR with the default Playbook's review skill.

A Review run would also have made the Board and Autopilot more complex (T1180–T1184): a new intent, a hand-back that resumes the Start Conversation, shared run slots, and Lanes that depend on Review run state.

## When to revisit

Only with new evidence that the inline review misses real defects. That could come from Run outcomes (T1193), or from PRs the User rejects at the Merge gate for something a review should have caught. A one-off review stays possible by hand: run `/code-review` on the branch.

## Prior requests

- T1093: "Independent Review stage (software factory phase 5)", with children T1179 to T1184
