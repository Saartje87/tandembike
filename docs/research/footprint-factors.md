# Factors for estimating a Conversation's Footprint (T1174)

Question: Tandembike will show an estimated Footprint (energy in Wh, CO₂e in g) for each agent Conversation, from the tokens recorded per Claude model: input, output, cache write and cache read. Anthropic publishes no per-token energy figures. Which defaults should the formula use for the energy per output token of each model tier (Haiku, Sonnet, Opus), the weight of the other three token types, the data-centre PUE, the grid carbon intensity, and the two everyday comparisons (phone charges, km by petrol car)? This file gives the evidence, the uncertainty of each figure, and one default per setting. It changes no app code.

Date: 2026-11-10.

## Answer in short

- **Energy is an order-of-magnitude estimate.** No source measures Claude. The defaults are anchored on Epoch AI's bottom-up estimate for a GPT-4o-class model and cross-checked against Google's measured Gemini figure. Expect a factor of 3 either way, and more for Opus.
- **Tier factors, PUE included:** Haiku 150, Sonnet 500, Opus 1,000 Wh per 1M output tokens.
- **Token fractions relative to one output token:** input 0.2, cache write 0.2, cache read 0.02.
- **PUE:** 1.15 (AWS reports 1.14, Google 1.09). The Epoch anchor already includes data-centre overhead. The tier factors above are `IT energy × 1.15`.
- **Grid:** 475 gCO₂e/kWh, the location-based global average for 2024.
- **Comparisons:** 19 Wh per smartphone charge, 9 W per LED bulb, 200 Wh per full 1.7 L kettle, 9,900 Wh per EU household-day, 250 gCO₂e per km by petrol car (§5, §6).
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

## 6. Everyday comparisons for the tooltip (T1345)

Added 2026-11-10 for Epic T1344: the Footprint tooltip lists five fixed comparisons, so three more reference values were needed. Each is used at one significant figure in the UI, so the defaults below only need to be right to about ±30%.

### Phone charge and petrol car, re-confirmed

Re-read on 2026-11-10 at the EPA Greenhouse Gas Equivalencies page (<https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references>, last updated 4 August 2026). Both values are unchanged:

- "0.019 kWh/smartphone charged" (1.24 × 10⁻⁵ t CO₂ per charge): **19 Wh** stays.
- "3.93 × 10⁻⁴ metric tons CO₂e/mile" for the average gasoline passenger vehicle, at 22.8 mpg in 2022: 244 g/km, **250 gCO₂e per km** stays.

### LED bulb: 9 W

The comparison is "hours of an LED bulb", meaning the bulb that replaces a classic 60 W incandescent, the household default.

- **What "60 W equivalent" means.** Commission Regulation (EC) No 244/2009, Annex II, Table 6, sets the lumen output a lamp must reach to claim an incandescent equivalent: **806 lm for 60 W** for LED lamps (<https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009R0244>). Packaging in the EU still uses this table.
- **What such a bulb may draw.** Commission Regulation (EU) 2019/2020, which replaced 244/2009 and applies from 1 September 2021, caps the on-mode power of a light source at `Ponmax = C × (L + Φuse / (F × η)) × R` (Annex II, 1(a); <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R2020>). For a non-directional mains lamp, F = 1.00 and the basic C = 1.08; η = 120 lm/W and L = 1.5 W, R = 1 for a standard colour rendering. For 806 lm: 1.08 × (1.5 + 806 / 120) ≈ **8.9 W**, the most a 60 W-equivalent LED bulb may draw on the EU market.
- **Products on the market** draw 8 to 10 W for 806 lm (retailer listings, and an EU EPREL register entry at 8.6 W seen in a search summary); not used as a source, only as a check.

**Default: 9 W**, the EU ceiling rounded. Uncertainty: 8–10 W. Region: EU rules; US bulbs of the same output draw about the same.

### Kettle: 200 Wh per full 1.7 L kettle

No government agency publishes a measured figure for one boil. The value is derived from physics, which is the stronger source here:

- **Volume.** 1.7 L is the usual maximum capacity of a household electric kettle in the UK and EU; the tooltip calls it "kettles boiled", a full one.
- **Heat needed.** Liquid water has a heat capacity of about 75.3 J/(mol·K) at 25 °C (NIST Chemistry WebBook, <https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Mask=2>), 4.18 J/(g·K). Heating 1.7 kg from 15 °C tap water to 100 °C: 1,700 × 4.18 × 85 ≈ 604 kJ ≈ **168 Wh**.
- **Kettle losses.** An electric kettle turns 80–95% of its energy into heat in the water (body, element and steam losses); consumer and manufacturer measurements put a full 1.7 L boil at 180–200 Wh (for example Morphy Richards, 0.20 kWh). These are secondary checks, not sources. 168 Wh / 0.85 ≈ 198 Wh.

**Default: 200 Wh.** Uncertainty: 160–210 Wh across start temperatures of 10–20 °C and efficiencies of 80–95%, which rounds to 200 Wh at one significant figure in every case.

### Household-day of electricity: 9,900 Wh, EU average

- **Source.** Odyssee-Mure, the EU-funded energy-efficiency database built on Eurostat and national statistics, gives an average electricity consumption of **3.6 MWh per dwelling per year for the EU**, from 1.8 MWh in Romania to 8.5 MWh in Sweden (<https://www.odyssee-mure.eu/publications/efficiency-by-sector/households/electricity-consumption-dwelling.html>, last updated November 2025). The page does not state the year of the figure; its update suggests 2023 or 2024 data.
- **Cross-check.** A news summary of Eurostat data gives 3,641 kWh per household for the EU in 2020 (<https://chronicle.lu/category/energy/41371-luxembourg-household-electricity-consumption-decreased-by-10-in-past-decade-eu-average-down-8-8>). Not a primary source; it agrees.
- **Per day.** 3,600 kWh / 365 ≈ 9.9 kWh.

**Default: 9,900 Wh per household-day, EU average.** The unit names the region: "days of an EU household's electricity". Uncertainty: about a factor of 2 between member states; the average is stable within a few percent year to year. A US household uses about three times as much, so the region must stay in the label.

### Summary

| Comparison              | Reference value | From   | Source                                      |
| ----------------------- | --------------: | ------ | ------------------------------------------- |
| Phone charges           |           19 Wh | energy | US EPA                                      |
| Hours of an LED bulb    |             9 W | energy | EU Regulations 244/2009 and 2019/2020       |
| Kettles boiled (1.7 L)  |          200 Wh | energy | Physics, NIST heat capacity, 85% efficiency |
| Days of an EU household |        9,900 Wh | energy | Odyssee-Mure, 3.6 MWh per dwelling per year |
| km by petrol car        |  250 gCO₂e / km | CO₂e   | US EPA                                      |

No comparison needed replacing: each has a primary source or a physical derivation.

## Not verified

- **Ember 2024 global intensity (473).** The Ember page did not state a per-kWh figure. It was derived from totals (about 474) and matched by secondary quotes (471–473).
- **Uptime Institute PUE 1.56.** Seen only in search summaries. The report itself was not opened. Summaries disagree (1.55, 1.56, 1.58) by method.
- **Kettle efficiency (80–95%).** Taken from consumer and manufacturer measurements, not a primary source; the rounded value does not depend on it.
- **The year behind Odyssee-Mure's 3.6 MWh.** Not stated on the page.
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
| LED bulb                | 9       | W                                     | EU Reg. 2019/2020, 806 lm           |
| Full kettle (1.7 L)     | 200     | Wh                                    | Physics, 85% efficiency             |
| EU household-day        | 9,900   | Wh                                    | Odyssee-Mure, 3.6 MWh/yr            |
