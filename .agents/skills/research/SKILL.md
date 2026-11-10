---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, a measurement taken from local logs or data, or reading legwork delegated to a background agent.
---

Spin up a **background agent** to do the research, so you keep working while it reads.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where. In this repo that is `docs/research/`.

## Data questions

Some questions are answered by measuring, not reading: how much a run costs, how often something happens, where time goes. For these:

- The primary source is the data itself: local logs (such as Claude Code session logs under `~/.claude/projects/`), the database, and the code that produces or reads the data. Docs only explain what a field means.
- You may do the work in the main run instead of a background agent, when the data is local, the run needs it next, or a background agent would only repeat your setup.
- Cite each claim to the file, query or entry it comes from: a log path, the SQL or command you ran, a record's id, or a code location. Keep a script you used next to the findings, so the numbers can be reproduced.
- The output is still one Markdown file under `docs/research/`.
