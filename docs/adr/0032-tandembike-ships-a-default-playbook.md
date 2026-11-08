# Tandembike ships a default Playbook; a repository's Agent commands override it

Amends [ADR 0019](0019-tandembike-starts-agent-runs.md) and [ADR 0020](0020-setup-advises-the-user-decides.md). Decided on 2026-11-08 (T1191) and built in phase 9 of [`software-factory-2.md`](../roadmap/software-factory-2.md) (T1195).

ADR 0019 tells a run only its situation and leaves the whole process to the repository: its skills, branch rules and when a Ticket is done. That made every new repository a setup job before the factory could work there. Setup (ADR 0020) checked for it, and the User entered Agent commands pointing at a skills plugin of their own. Tandembike is meant to work with any repository on the machine, and most have no such process.

Tandembike therefore ships a **Playbook**: a Claude Code plugin bundled with it and loaded into every run through the Agent SDK's plugins option. It has one skill per **Stage**: triage, spec, implement (Start), review (run inline by Start), merge, plan and retro. The skills are adapted from `mattpocock-skills`, whose MIT notice the plugin keeps, and call Tandembike's workflow tools directly. A Project's Agent command overrides the Playbook for its Stage. A blank command now means the Playbook's skill, not a plain `Start T42`. The command still goes at the start of the run's first message, as ADR 0019 requires.

What stays the repository's: its instructions (`CLAUDE.md`), its Check command, its prepare command and any Stage it overrides. A repository with a process of its own, like this one, keeps it.

## Considered Options

- Keep the process repository-owned: every repository needs Setup and a skills plugin before its first run.
- Setup copies the Playbook into each repository's `.claude/skills`: copies drift from Tandembike's tools and Setup edits every repository.
- Stage prompts in Tandembike's code, without skills: a terminal session could not use them, and repositories could not override one Stage.
- Tandembike owns the whole process and repositories supply only commands: repositories with their own conventions lose them.

## Consequences

- Setup becomes optional suggestions, such as adding a `CLAUDE.md`; it is no longer needed before a first run.
- The Playbook uses the SKILL.md format, so a later Copilot runner (T596) can load the same skills.
- Playbook changes ship with Tandembike, and Run outcomes record whether the Playbook or an override ran, so a Playbook change can be measured.
- The install offers to register the plugin at user scope too, so terminal sessions get the same Stages (phase 10).
