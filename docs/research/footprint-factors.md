# Factors for estimating a Conversation's Footprint (T1174)

Question: Tandembike will show an estimated Footprint (energy in Wh, CO₂e in g) for each agent Conversation, from the tokens recorded per Claude model: input, output, cache write and cache read. Anthropic publishes no per-token energy figures. Which defaults should the formula use for the energy per output token of each model tier (Haiku, Sonnet, Opus), the weight of the other three token types, the data-centre PUE, the grid carbon intensity, and the two everyday comparisons (phone charges, km by petrol car)? This file gives the evidence, the uncertainty of each figure, and one default per setting. It changes no app code.

Date: 2026-11-10.

## Answer in short

- **Energy is an order-of-magnitude estimate.** No source measures Claude. The defaults are anchored on Epoch AI's bottom-up estimate for a GPT-4o-class model and cross-checked against Google's measured Gemini figure. Expect a factor of 3 either way, and more for Opus.
- **Tier factors, PUE included:** Haiku 150, Sonnet 500, Opus 1,000 Wh per 1M output tokens.
- **Token fractions relative to one output token:** input 0.2, cache write 0.2, cache read 0.02.
- **PUE:** 1.15 (AWS reports 1.14, Google 1.09). The Epoch anchor already includes data-centre overhead. The tier factors above are `IT energy × 1.15`.
- **Grid:** 475 gCO₂e/kWh, the location-based global average for 2024.
- **Comparisons:** 19 Wh per smartphone charge, 250 gCO₂e per km by petrol car.
- **Not verified:** the Ember 2024 figure is confirmed only through secondary sources, and the UK DESNZ per-km car factor could not be read. See "Not verified".

## Formula

```
energy_Wh = Σ models (output + 0.2·input + 0.2·cacheWrite + 0.02·cacheRead) / 1e6 × tierFactor[tier]
CO₂e_g    = energy_Wh / 1000 × gridIntensity
```

`tierFactor` is in Wh per 1M output tokens and already includes PUE.

## 1. Energy per 1M output tokens, per tier

### Anchor: Epoch AI, GPT-4o

Epoch AI estimates about 0.3 Wh for a typical GPT-4o text query (<https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use>). The assumptions:

- About 100B active parameters (200B total, mixture of experts, range 100–400B total).
- 2 FLOP per active parameter per output token.
- 500 output tokens per query, which Epoch calls pessimistic.
- H100 at 10% compute utilisation, derived from open-model API prices.
- 1,500 W per GPU including server and 10–20% data-centre overhead, at about 70% of peak draw.

That is 0.3 Wh per 500 tokens, or **about 600 Wh per 1M output tokens, PUE included**, for about 100B active parameters. Scaling is roughly 6 Wh per 1M tokens per billion active parameters. Epoch's own range is about 0.1 to 4 Wh per query, so a factor of 3 to 10 either way.

### Cross-checks

| Source                                    | Figure                                                                                 | Per 1M output tokens                         | Note                                                                                                                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google, Gemini Apps, Aug 2025             | 0.24 Wh median text prompt, PUE 1.09 included, idle machines and host CPU/RAM included | not stated (tokens per prompt not published) | Measured on Google's own fleet. A 0.10 Wh "active accelerator only" number is called optimistic. <https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference>                |
| Jegham et al. 2025, "How Hungry is AI?"   | Claude-3.7 Sonnet 0.950 Wh for 100 in / 300 out; Claude-3.5 Haiku 0.975 Wh             | about 3,200 Wh                               | Infers hardware from public API speeds, uses AWS PUE 1.14. Likely an upper bound: it ranks Haiku above Sonnet, which is an artefact. <https://arxiv.org/abs/2505.09598>, tables from <https://arxiv.org/html/2505.09598v6> |
| Samsi et al. 2023, "From Words to Watts"  | LLaMA 65B, about 3–4 J per output token on V100 (GPU only)                             | about 900–1,100 Wh                           | Old hardware, GPU only, no PUE. <https://arxiv.org/abs/2310.03003>                                                                                                                                                         |
| Mistral Large 2 life-cycle analysis, 2025 | 1.14 gCO₂e per 400-token response                                                      | not comparable                               | Includes manufacturing of servers. Energy not given. <https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai>                                                                                  |

Reading: the plausible range for a frontier-size model is about 300 to 3,000 Wh per 1M output tokens. Epoch's 600 sits in the lower-middle. Google's 0.24 Wh per prompt is consistent with a few hundred output tokens at that level.

### Tier sizes

Anthropic does not publish parameter counts. The tiers are reasoned from two public signals:

1. **Price per output token** (<https://platform.claude.com/docs/en/about-claude/pricing>). Prices follow serving cost. The 4.x generation lists Haiku 4.5 at $5, Sonnet 4.6 at $15 and Opus 4.5 at $25 per 1M output tokens (1 : 3 : 5). The 5.5 generation lists Haiku 5.5 at $0.50, Sonnet 5.5 at $10 and Opus 5.5 at $20 (1 : 20 : 40). Opus 4.1 was $75, 5 times Sonnet. Prices also reflect margin and demand, so they set direction, not size.
2. **Energy scales with active parameters** (Epoch's model above, and Samsi's 65B figure).

Assumed sizes, all guesses: Sonnet near the Epoch anchor (about 100B active), Haiku about 3 to 4 times smaller, Opus about 2 times larger. The Haiku 5.5 price suggests the small tier could be even smaller. A fixed floor (batching, idle, host overhead) keeps energy from falling in line with size, so the ratios are softened.

| Tier   | Assumed active size | IT energy, Wh per 1M output | With PUE 1.15 | Default   |
| ------ | ------------------- | --------------------------- | ------------- | --------- |
| Haiku  | about 25–35B        | 130                         | 150           | **150**   |
| Sonnet | about 70–100B       | 435                         | 500           | **500**   |
| Opus   | about 200B          | 870                         | 1,000         | **1,000** |

Sonnet is set a little below Epoch's 600 because Anthropic's current Sonnet is priced below GPT-4o-class models and newer hardware is more efficient. Uncertainty: a factor of 3 up or down for Sonnet, and larger for Haiku and Opus. The ordering Haiku < Sonnet < Opus is more reliable than the absolute values.

## 2. Input, cache-write and cache-read tokens, relative to an output token

No source measures these ratios for production serving. The constants come from the hardware argument and from Anthropic's prices.

- **Input (prefill) is cheaper per token.** Prefill processes all prompt tokens in parallel and is compute-bound. Decode produces one token per step and is memory-bound. A 2025 energy review states decoding "is more energy intensive per token than prefill" and that decoding energy dominates except for the shortest generations (<https://arxiv.org/html/2504.17674v1>), but gives no ratio. Epoch assumes only 10% utilisation for decode; prefill commonly reaches several times that, so about 5 times cheaper per token is reasonable. Anthropic's list prices agree: input is 1/5 of output on Opus 5.5 ($4 vs $20) and Sonnet 5.5 ($2 vs $10), and in the 4.x generation. **Default 0.2.** Uncertainty: 0.05 to 0.5. For very long prompts, attention cost grows with length (Epoch: about 2.4 Wh at 10k input tokens, about 40 Wh at 100k), so 0.2 understates very long first prompts.
- **Cache write is a prefill.** The tokens are computed like normal input and the KV values are stored. The 25% price premium for a 5-minute write (1.25 times input) covers storage, not compute. **Default 0.2**, same as input. Uncertainty: 0.2 to 0.3.
- **Cache read skips the prefill.** The server loads stored KV values from memory instead of recomputing them. Anthropic prices a read at 1/10 of input (Opus 4.5 $0.50 vs $5, Sonnet 4.6 $0.30 vs $3). Taking the same ratio of the energy gives 0.1 × 0.2. **Default 0.02.** Uncertainty: 0 to 0.05. The extra attention cost of a long cached context during decode is not counted here, so 0.02 slightly understates very long contexts.

## 3. Data-centre PUE

PUE is total facility energy divided by IT equipment energy.

| Operator                                       | PUE                         | Source                                                                                                     |
| ---------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Google, fleet average                          | 1.09                        | <https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference> |
| AWS, global average                            | 1.14 in 2025 (1.15 in 2024) | <https://sustainability.aboutamazon.com/environment/the-cloud>                                             |
| Azure, as assumed by Jegham et al.             | 1.12                        | <https://arxiv.org/html/2505.09598v6>                                                                      |
| Industry average, Uptime Institute 2024 survey | about 1.56                  | Secondary summaries only, see "Not verified". Not representative of hyperscalers.                          |

Anthropic runs on AWS and Google Cloud, so **1.15** is a safe round default. Uncertainty: plus or minus 0.05, small next to the other factors.

**Do the energy estimates include PUE?**

- Epoch: yes, through the 1,500 W per GPU figure, which includes 10–20% data-centre overhead. Treat the 600 Wh anchor as PUE-included.
- Google: yes, explicitly.
- Jegham et al.: yes, they multiply by PUE.
- Samsi et al.: no, GPU power only.

**How to fold it in.** Work in IT energy, then multiply once:

```
tierFactor = ITenergy × PUE
Sonnet: 435 × 1.15 ≈ 500 Wh per 1M output tokens
```

Do not apply PUE again at run time. The settings store the folded factor.

## 4. Grid carbon intensity

**Default 475 gCO₂e/kWh, location-based.**

- **Global average 2024:** about 473 gCO₂/kWh (Ember Global Electricity Review 2025, <https://ember-energy.org/latest-insights/global-electricity-review-2025/>). That page gives power-sector emissions of 14.6 Gt CO₂ and a 40.9% low-carbon share, which implies about 474. The exact 473 comes from secondary quotes of Ember's data (471–473). Uncertainty: plus or minus 1%.
- **US average:** about 394 gCO₂/kWh (EPA eGRID 2022, line losses included, <https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references>).
- **AWS CIF used by Jegham et al.:** 287 g/kWh (<https://arxiv.org/html/2505.09598v6>). **Google's own number:** 0.03 g for 0.24 Wh is 125 g/kWh, derived. It uses Google's 2024 fleet-wide intensity and the page does not say whether that is market-based.

**Why location-based.** Anthropic runs on AWS and Google Cloud, which report market-based figures that net out renewable certificates and power-purchase agreements. Those low numbers describe contracts, not the electricity physically drawn at the time. Location-based intensity describes the physical grid and is the honest default for physical emissions. The data-centre region of a given request is not known to Tandembike, so a global average avoids false precision. A US-heavy or renewable-heavy mix would give 125 to 400; a coal-heavy one 600 or more. Make the value a setting so a User can change it.

## 5. Comparison references

- **Smartphone charge: 19 Wh.** EPA: 0.019 kWh per full charge (28.446 Wh over 24 h minus maintenance-mode energy), 12.4 gCO₂e at EPA's marginal rate (<https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references>). This is energy drawn from the wall, battery losses included. Uncertainty: 10–20 Wh depending on phone.
- **Petrol car: 250 gCO₂e per km.** EPA: 393 gCO₂e per mile for the average US gasoline passenger vehicle (22.8 mpg, 2022), which is 244 g/km (same EPA page). Round to 250. Uncertainty: the average car on the road varies by country. The EEA gives 106.7 g/km for new cars registered in the EU in 2024, all fuels, type-approval (<https://www.eea.europa.eu/en/newsroom/news/average-co2-emissions-from-new-cars-and-vans-significantly-decreased-in-2025>, figure via search summary), which is much lower because it is new cars, includes electric ones, and is a lab cycle. 250 is the conservative in-use petrol value.

## Not verified

- **Ember 2024 global intensity (473).** The Ember page did not state a per-kWh figure. It was derived from totals (about 474) and matched by secondary quotes (471–473).
- **Uptime Institute PUE 1.56.** Seen only in search summaries. The report itself was not opened. Summaries disagree (1.55, 1.56, 1.58) by method.
- **UK DESNZ 2025 conversion factor for an average petrol car.** The spreadsheets could not be read, so no DESNZ per-km number is used.
- **EEA 106.7 g/km.** Taken from a search summary; the EEA page was not opened.
- **Tier sizes and the three token fractions.** No source measures them. They are reasoned estimates, as set out above.
- **Jegham et al. tables.** Read through a summarising fetch of the HTML version, not the PDF.
- **ML.ENERGY leaderboard and Luccioni et al. (AI Energy Score).** Could not be extracted, so no figure from them is used.

## Recommended defaults

| Setting                 | Default | Unit                                  | Basis                               |
| ----------------------- | ------- | ------------------------------------- | ----------------------------------- |
| Haiku factor            | 150     | Wh per 1M output tokens, PUE included | Scaled from Epoch, about 30B active |
| Sonnet factor           | 500     | Wh per 1M output tokens, PUE included | Epoch anchor, 435 × 1.15            |
| Opus factor             | 1,000   | Wh per 1M output tokens, PUE included | About 200B active, 870 × 1.15       |
| Grid intensity          | 475     | gCO₂e/kWh, location-based             | Ember global 2024                   |
| Input fraction          | 0.2     | of one output token                   | Prefill vs decode, 1:5 price ratio  |
| Cache-write fraction    | 0.2     | of one output token                   | Same compute as prefill             |
| Cache-read fraction     | 0.02    | of one output token                   | 1/10 of input, from the price ratio |
| PUE (already folded in) | 1.15    | ratio                                 | AWS 1.14, Google 1.09               |
| Smartphone charge       | 19      | Wh                                    | EPA                                 |
| Petrol car              | 250     | gCO₂e per km                          | EPA, 393 g/mile                     |
