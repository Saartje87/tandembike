# Orchestrator agent

Tandembike does not get an orchestrator agent: a long-lived Agent, or a run that starts other runs, that watches the factory and decides what happens next. Autopilot (ADR 0030) stays the only dispatcher.

## Why this is out of scope

It was considered in a grilling session on 2026-11-11, against 18 days of history and the Conversations recorded from 2026-11-09. The three gaps an orchestrator would fill are each rare or already closed, so it would add a second dispatcher, and the complexity of one, for little gain.

If judgment is ever needed, it is a short run started at a defined point, such as a stalled run, red CI, a merge hand-off or a collision, as Triage runs are. It is never a long-lived agent and never a run that starts other runs. The User keeps needs-info and Auto-merge refusals. An orchestrator stays out of triage and Ticket creation.

### (a) Recovery of failed or stalled runs

Rare. About 5 real CI failures in roughly 265 PRs, 3 early stops that all came from one cause, fixed by T1282, and no recorded Stalled Ticket. Too few for an agent that watches for them.

### (b) Parallel Epic children

An Epic runs its children one after another in one run. That usually takes 20 to 60 minutes, with one outlier: T596, 20 children, about 5.4 hours. `implement-spec` ran children in parallel; T1282 removed it when it consolidated the implement skills, not because the orchestration failed (see T1147, T1225, T1227). Parallel children cause the collisions in (c), so (b) must be designed together with (c).

### (c) Collisions between parallel runs

At least 8 migration-number collisions on 8 and 9 November, all from `implement-spec`'s parallel implementers (T1091, T1193, T1197), and none since T1162 and T1282. About 4% of PRs needed a merge from `main` to catch up.

## When to revisit

- **(a)** When more than 3 unfinished Start runs a month sit waiting for the User. Measure it on the Stats page's Run outcomes: Start runs that ended Abandoned plus Needs reply over the last 30 days.
- **(b)** When Epics that take over an hour become routine. Design it together with (c).
- **(c)** When collisions plus catch-up merges from `main` exceed about 10% of PRs.

## Prior requests

- The 2026-11-11 grilling session, recorded in T1417
- `implement-spec`'s parallel implementers, removed by T1282
