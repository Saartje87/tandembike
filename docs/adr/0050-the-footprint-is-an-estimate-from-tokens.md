# The Footprint is an estimate from tokens

Amended by [ADR 0051](0051-agent-kinds-claude-code-and-copilot.md): Copilot runs record tokens per model too. A Claude model served by Copilot maps to the tiers; any other model on a Copilot run is not measured, never counted as Opus. Cost is in each Agent kind's own unit: dollars for Claude Code, AI credits for Copilot.

The User sees what each Conversation costs in USD, not what its runs cost the environment. Cost is a poor stand-in: price per token differs from energy per token between models and token types, and prices change. Tandembike now shows a **Footprint** for every Conversation it runs: the estimated energy (Wh) and CO₂e of its runs, worked out from the tokens they used. Anthropic publishes no per-token energy figures, so every factor below is an outside estimate with wide uncertainty, taken from [`docs/research/footprint-factors.md`](../research/footprint-factors.md) (T1174). Expect a factor of 3 either way, and more for Haiku and Opus.

## The method

- **Tokens per model.** Each run reports, with every turn, the tokens it has used so far per model: input, output, cache write and cache read, from the SDK result's `modelUsage`. Like `costUsd` it is a running total for the run. The Conversations module keeps one `conversation_usage` row per (Conversation, model): the usage from when the run started plus what the run reports, so resumes add up as cost does, and a stopped run keeps what its last turn reported.
- **Weighted tokens.** Output tokens count fully. The other types count as a fixed fraction of an output token, set as constants in code (research §2):

  | Token type  | Fraction | Why                                                                |
  | ----------- | -------- | ------------------------------------------------------------------ |
  | output      | 1        | Decode, one forward pass per token                                 |
  | input       | 0.2      | Prefill is batched and runs at higher utilisation; 1:5 price ratio |
  | cache write | 0.2      | The same compute as prefill                                        |
  | cache read  | 0.02     | A KV-cache load, 1/10 of input, from the price ratio               |

- **Energy.** `energy_Wh = Σ models (output + 0.2·input + 0.2·cacheWrite + 0.02·cacheRead) / 1,000,000 × tierFactor[tier]`, where the tier factor is Wh per 1M output tokens with data-centre PUE already folded in (`IT energy × 1.15`, research §3). PUE is never applied again at run time.
- **CO₂e.** `CO₂e_g = energy_Wh / 1000 × grid intensity` (gCO₂e/kWh).
- **Tiers.** A model id matches a tier by name, ignoring case: one containing `haiku` is Haiku, `sonnet` is Sonnet, `opus` is Opus. **Any other model counts as Opus**, the highest factor, so the Footprint never underestimates silently.

## The factors and their defaults

Four factors are app-wide settings the User can change on `/settings`, each starting from its default (research, "Recommended defaults"):

| Factor         | Default | Unit                                  | Source (research file)                     |
| -------------- | ------: | ------------------------------------- | ------------------------------------------ |
| Haiku          |     150 | Wh per 1M output tokens, PUE included | §1, scaled from Epoch AI, about 30B active |
| Sonnet         |     500 | Wh per 1M output tokens, PUE included | §1, Epoch AI anchor, 435 × 1.15            |
| Opus           |   1,000 | Wh per 1M output tokens, PUE included | §1, about 200B active, 870 × 1.15          |
| Grid intensity |     475 | gCO₂e/kWh, location-based             | §4, Ember global average 2024              |

Location-based, because it describes the electricity physically drawn; market-based figures net out certificates and contracts. The token-type fractions are constants, not settings: a full grid of factors would invite false precision.

The factors live in a new **Settings module** (`src/settings/`), backed by a small table of its own. It is the only code that reads or writes them; it refuses a value that is not a finite number ≥ 0, naming the field, and can reset a factor to its default. The machine settings (ADR 0041) stay where they are. Footprints are computed when read and never stored, so a changed factor applies to every Conversation, past ones included.

## Comparisons

A tooltip on the Footprint gives "≈ N phone charges · ≈ N km by car", from fixed reference values (research §5). Amended to five comparisons, see "Amendment: a relatable Footprint" below:

- **19 Wh per smartphone charge**: US EPA Greenhouse Gas Equivalencies, 0.019 kWh per full charge (<https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references>).
- **250 gCO₂e per km by petrol car**: the same EPA page, 393 g per mile for the average US gasoline passenger vehicle, 244 g/km, rounded.

Phone charges come from energy, km by car from CO₂e.

## Not measured

A Conversation without any `conversation_usage` row is **not measured**: Conversations from before token recording, Terminal Conversations (Tandembike sees no usage of an interactive session, ADR 0039) and runs that never reported a turn. It shows "not measured", never a number, and is left out of every total, which says how many it left out. It is never estimated from its cost.

## Totals

The Stats page shows the Footprint per Project, all time, and per Cycle. Hand-started and Autopilot Conversations count alike, with no split. A Conversation counts towards:

- **its Autopilot Cycle**, when Autopilot started it for one (the Cycle the Spend ceiling counts it against);
- otherwise **its Ticket's Cycles**: each Cycle, Active, Prepared or Archived, whose Tickets include its Ticket now. A Ticket carried over from one Cycle to the next counts in both, as it was worked on in both; the per-Project total counts every Conversation once.

Project-scoped Conversations (Ask, Plan, Retro, Batch triage, New Ticket, Setup, Spar) have no Ticket and count only in the Project total. Linking them to a Cycle by intent (a Retro's Cycle, a Batch triage's Board) was left out: it would split the rule by intent for little gain.

## Information only

The Footprint never pauses Autopilot, never limits a run and is not part of any ceiling; the Spend ceiling, Triage ceiling and Machine ceiling stay the only limits. A rough estimate must never stop real work. Wherever it shows, it is marked as an estimate: "~12 Wh · ~4 g CO₂e est.", with units scaling (Wh → kWh → MWh, g → kg → t). It shows next to the cost in the chat header and in the Ticket's Conversation list, updating live through the same `conversation` change that carries the cost, on the Stats page, and, since the amendment below, as the whole Cycle's Footprint on the Active Cycle's Autopilot bar; not on Ticket cards, Epic totals, the Cockpit or the status line.

## Considered Options

- **Estimate from cost.** Price per token differs from energy per token between models and token types, and prices change. Old Conversations stay not measured rather than get a made-up number.
- **Ranges or confidence intervals.** Honest, but noisy next to a cost; the uncertainty is stated here and in the research file, and the UI marks every figure as an estimate.
- **Per-Project factors, or a factor per token type and tier.** More knobs than the evidence supports.
- **A self-report tool for MCP-only agents** such as a terminal Claude Code: they report no usage, and a self-reported number could not be checked.

## Consequences

- Every figure moves when the User changes a factor, past Conversations included.
- A new model family whose name matches no tier counts as Opus until the tier matching learns it.
- Usage recording starts with this change; earlier Conversations stay not measured for good.

## Amendment: a relatable Footprint (2026-11-10, T1344)

"~66 Wh · ~32 g CO₂e est." meant little to the User on its own. The two comparisons sat in a tooltip with nothing hinting it was there, so the User found it only after asking. Two comparisons did not land either: a fraction like "≈ 0.13 km by car" feels like nothing. The Stats totals had no comparisons at all, and the Autopilot bar showed what a Cycle cost but not its Footprint. So:

- **Five fixed comparisons.** Every measured Footprint's tooltip lists all five, always in this order, whatever the size (research §6):

  | Comparison                            | Reference value | From   | Source                                                                        |
  | ------------------------------------- | --------------: | ------ | ----------------------------------------------------------------------------- |
  | phone charges                         |           19 Wh | energy | US EPA, 0.019 kWh per full charge                                             |
  | hours of an LED bulb                  |             9 W | energy | EU Regulations 244/2009 (806 lm = 60 W equivalent) and 2019/2020 (power cap)  |
  | kettles boiled                        |          200 Wh | energy | A full 1.7 L kettle, 15 → 100 °C, NIST heat capacity of water, 85% efficiency |
  | days of an EU household's electricity |        9,900 Wh | energy | Odyssee-Mure, 3.6 MWh per dwelling per year, EU average                       |
  | km by petrol car                      |  250 gCO₂e / km | CO₂e   | US EPA, 393 g per mile                                                        |

  Energy drives the first four and CO₂e the car, so changing the grid intensity changes only the car. The reference values are constants in code with their source, not settings, like the token fractions.
- **One significant figure.** Each comparison shows as "≈ N <unit>" rounded to one significant figure ("≈ 0.02 kettles boiled", "≈ 4000 phone charges"), replacing the "<0.01" floor. The estimate may be off by a factor of 3, so more digits would claim precision it does not have.
- **A dotted underline is the hint.** Every Footprint that has a tooltip shows a dotted underline, the same everywhere, and opens its tooltip on hover and on keyboard focus. "not measured" has no tooltip and no underline. One component renders every Footprint, so the hint, tooltip and rounding cannot drift between places.
- **Comparisons stay in the tooltip.** The visible text stays "~66 Wh · ~32 g CO₂e est.": five comparisons inline would crowd the cost beside it.
- **The Cycle's Footprint on the Autopilot bar**, reversing its earlier exclusion. The Active Cycle's Board shows the whole Cycle's Footprint after the Autopilot spend, labelled "Cycle:" so it is not read as the Footprint of the Autopilot-only money beside it. It counts every Conversation of the Cycle by the per-Cycle rule in "Totals", hand-started ones included, so it equals the Stats page's figure for that Cycle; its tooltip opens with "All Conversations on this Cycle, hand-started included". It updates live with the spend through the same Board refresh. A Cycle with no Conversations shows nothing; one whose Conversations recorded no tokens shows "Cycle: Footprint not measured". It stays information only: it pauses nothing and counts toward no ceiling. Prepared and Archived Cycles keep their figures on Stats.

### Considered Options

- **A comparison inline next to the figure.** More visible, but it crowds the cost, and one comparison picked for everyone lands for only some.
- **Adaptive comparisons** that pick the best-fitting unit by size. Reads well, but two Footprints could no longer be compared by scanning the same line, and what shows would be harder to predict.
- **Trees absorbing CO₂, flights, web searches or a personal CO₂ budget.** Trees and budgets rest on contested assumptions; flights dwarf any Conversation; a web search has no primary-sourced energy figure.
- **Only the Autopilot Conversations' Footprint on the Autopilot bar**, matching the spend beside it. It would undercount what the Cycle really used and disagree with Stats; the label sets the whole-Cycle figure apart instead.
