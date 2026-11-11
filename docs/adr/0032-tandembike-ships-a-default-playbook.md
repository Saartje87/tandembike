# Tandembike ships a default Playbook; a repository's Agent commands override it

Amended by [ADR 0051](0051-agent-kinds-claude-code-and-copilot.md): a run gets a Stage and a Ticket, and each Agent kind's runner invokes the Playbook skill its own way. Copilot loads the same Playbook as a plugin. Agent command overrides apply to Claude Code runs only.

Amends [ADR 0019](0019-tandembike-starts-agent-runs.md) and [ADR 0020](0020-setup-advises-the-user-decides.md). Decided on 2026-11-08 (T1191) and built in phase 9 of [`software-factory-2.md`](../roadmap/software-factory-2.md) (T1195).

ADR 0019 tells a run only its situation and leaves the whole process to the repository: its skills, branch rules and when a Ticket is done. That made every new repository a setup job before the factory could work there. Setup (ADR 0020) checked for it, and the User entered Agent commands pointing at a skills plugin of their own. Tandembike is meant to work with any repository on the machine, and most have no such process.

Tandembike therefore ships a **Playbook**: a Claude Code plugin bundled with it and loaded into every run through the Agent SDK's plugins option. It has one skill per **Stage**: triage, spec, implement (Start), review (run inline by Start), merge, plan and retro. The skills are adapted from `mattpocock-skills`, whose MIT notice the plugin keeps, and call Tandembike's workflow tools directly. A Project's Agent command overrides the Playbook for its Stage. A blank command now means the Playbook's skill, not a plain `Start T42`. The command still goes at the start of the run's first message, as ADR 0019 requires.

The spike T1205 (`docs/research/sdk-plugin-per-run.md`) confirmed the mechanism and fixed three details:

- The plugin is named `tandembike`, and its commands are always sent namespaced, `/tandembike:<stage>` (for example `/tandembike:implement T42`), never bare. A bare name also reaches the User's own plugins, which may ship a skill of the same name, and the order they resolve in is undocumented. A command the Project set is sent as it is, so a repository's own skill of the same bare name never collides with the Playbook's.
- The runner passes the plugin to every run through the SDK's `plugins` option as a local path to the folder bundled with Tandembike. A run needs nothing in the repository's `.claude/`.
- When a user-scope copy of the plugin is installed too (phase 10), the inline copy is the only one loaded: it wins. A user-scope copy is a cached copy keyed by `version`, so each change to the Playbook bumps the plugin's `version`, enforced by a test that compares a lock file beside the plugin with a hash of its files.

Each Stage resolves on its own: the Project's command for it, otherwise the Playbook's. A blank command for Start on an Epic is the Playbook's `implement-epic`, not the Project's Start command. Existing Projects keep the commands they stored; only new Projects start blank.

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
