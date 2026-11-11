# Project settings save per section, and switches save at once

Decided on 2026-11-11 with the User for the Project settings overhaul, Epic T1430, after the layout prototype T1431.

A Project's Settings tab held about twenty fields behind one Save at the bottom. A switch looked saved when it was not, an edit far up the page was lost when the User left, and one refusal held back every other change. Rename, colour and icon sat in the Project header instead, and Archive only on the Projects page.

## Decision

- **Six sections, one tab each:** General, Repository, Agent, Automation, Commands and References, as Blocks `Tabs`. Each tab holds one card with the section's title, a one-sentence description and the longer rules behind a collapsed "How this works". The selected tab lives in `?section=`. A field anchor (`projectSettingsFieldPath`, such as `#check-command`) opens the tab that holds the field and scrolls to it. Without either, the page opens on General, or on Repository while no repository path is saved.
- **A switch saves at once.** Agent mode, Parallel runs, Autopilot, Auto-merge and Auto-triage each save when flipped, optimistically, as the Autopilot switch on the Flow page does (`project-switch`). A refusal puts the switch back and shows why under it. A brief "Saved" confirms the save. Turning on agent mode or Parallel runs offers Setup under that switch.
- **Text fields save per section.** A section's text fields, selects and radios save with that section's Save, which shows in the card's header, beside Discard, only while the section has unsaved edits. A refusal shows under the field it names and keeps the draft. The Colour and icon picker saves at once, as a switch does.
- **A switch that needs a ceiling waits for one.** Autopilot and Auto-triage turn on only with a ceiling (ADR 0051's unit). A ceiling is disabled while its switch is off. Turning the switch on while no ceiling is saved does not save: it holds the switch on as an unsaved edit of the section and enables the ceilings, so the section's Save sends the switch and its ceiling together.
- **Each save sends only its own fields.** `setProjectAgentSettings` takes a partial update; fields left out keep their saved values (T1432). A section's Save never overwrites what another section or a switch saved meanwhile.
- **Unsaved edits survive a tab switch.** The tab panels stay mounted, and a tab with unsaved edits shows an orange dot, labelled "Unsaved changes". Leaving the page does not prompt.
- **General owns the Project's identity.** Its name, colour and icon, and Archive below the card as a danger zone. The Project header shows the name and icon and links to Settings, without editing them.

## Consequences

- Each section is its own form component with its own `useForm`, and its own tests. `AgentSettingsForm` is gone.
- Agent and Automation stay reachable without a repository path; their controls are disabled under "Set a repository path first → Repository".
- The Autopilot switches on the Flow page and in the Autopilot bar stay. The machine-wide `/settings` page keeps its single Save; it may adopt this model later.
