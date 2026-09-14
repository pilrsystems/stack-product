# Build brief — educational page + two home page inserts

You are adding one new page and two small sections to the pilr site.
All copy below is final. Do not rewrite it, do not add sections that
aren't listed here, and do not invent statistics.

---

## Step 0 — match the existing site first

Before writing anything, read the existing page components and styles
(the home page, the product cards, the global CSS/theme file). Reuse
the existing components, spacing scale, type scale and color tokens.
The new page must look like it was always part of the site — not like
a new template dropped in.

Brand constraints:

- "pilr" is always lowercase.
- Colors: slate `#425563`, cream `#F5F0E8`. Use white for surfaces.
  No other colors unless they already exist in the theme.
- Typeface: Helvetica Neue (match whatever the site already uses).
- Voice: calm, minimal, direct, present tense. Short sentences.
  No exclamation points. Never "optimize," "level up," "crush your goals."
- No icons, no emoji, no stock illustration. Type and space only.
  Leave clearly marked image slots where product photography should go.

---

## Part 1 — new page

**Route:** `/pages/the-routine-problem` (or the equivalent in this stack)
**Nav:** add a link in the footer only. Do not add it to the main nav.
**Layout:** single column, generous vertical rhythm, alternating
white / cream / slate backgrounds in that order down the page.

### Section 1 — opener (white)

- Eyebrow: `why we built this`
- H1: `Routines don't fail at home.`
- Body: `They fail in a hotel room at 6am, with your magnesium at the bottom of a bag. Four days away is how a two-year habit ends.`

### Section 2 — the stack (cream)

- H2: `Nobody takes one thing anymore.`
- Body: `A stack isn't a bottle. It's four bottles, a scoop, and a bag you didn't plan for. One container was never going to hold a routine.`
- Three stat tiles in a row (stack to one column on mobile). Each tile
  is a large figure, a short caption, and a small source line:

| Figure | Caption | Source line |
|---|---|---|
| `74%` | `of US adults take supplements` | `CRN / Ipsos, n=3,192` |
| `70%+` | `take more than one every day` | `NHANES, n=12,529` |
| `5 yrs+` | `how long 4 in 10 have kept it up` | `NHANES, n=12,529` |

Each source line is a superscript footnote number linking to the
sources list at the bottom of the page (see Part 3).

### Section 3 — the disruption (slate, cream text)

This is the most important section on the page.

- Eyebrow: `the actual failure point`
- H2: `The trip is the thing that breaks it.`
- Body paragraph 1: `Most people don't quit their routine. They pause it — for a weekend, a work trip, a week away. The pause is where it ends.`
- Body paragraph 2: `Organization isn't an accessory to the routine. In controlled research, people using an organizer were measurably more likely to stay on protocol. The container is part of the protocol.`
- One stat tile: figure `+15 pts`, caption `higher probability of staying on protocol with an organizer`, source `Petersen et al., Clin Infect Dis, 2007`

### Section 4 — powder and security (white)

- Eyebrow: `powder, specifically`
- H2: `Under the limit. By design.`
- Body: `TSA screens powders over 350 mL separately. What can't be resolved at the checkpoint is thrown away — which is how people lose a month of creatine on a Tuesday morning.`
- Then a simple spec list, left label / right value, hairline rules
  between rows, tabular figures:

```
TSA carry-on powder threshold    350 mL
Powder Pod                       180.6 mL
Hybrid Pod                       141.3 mL
Pill Pod                         82.2 mL
```

### Section 5 — close (cream)

- H2: `One system. However your routine is shaped.`
- Body: `Three pod sizes, one thread. Build it once. Refill it in seconds.`
- Primary CTA button linking to the shop/build page: `build your system →`

---

## Part 2 — two home page changes

### 2A — add one section to the home page

Place it **directly below the three product cards**, above the existing
"Pilr will upgrade your Focus" block.

- Eyebrow: `why we built this`
- H2: `Routines don't fail at home.`
- Body: `They fail in a hotel room at 6am, with your magnesium at the bottom of a bag. Most people don't quit their routine — they pause it for a trip, and the pause is where it ends.`
- Two stat tiles side by side:
  - `70%+` / `of supplement users take more than one every day` / `NHANES, n=12,529`
  - `+15 pts` / `higher probability of staying on protocol with an organizer` / `Petersen et al., 2007`
- Text link below: `the routine problem →` linking to the new page.

That is the only new home page section. Do not add the rest of the
educational page to the home page.

### 2B — fix two existing claims

In the existing feature list on the home page:

1. Replace the `TSA Approved` item.
   - New title: `Under the TSA powder limit`
   - New body: `Every pod holds under 180.6 mL, against a 350 mL carry-on powder threshold. Not a workaround — a dimension.`
   - Reason: TSA runs no approval program for containers, so the old
     claim can't be supported.

2. In the `BPA Free` item, remove the words `with zero microplastics`.
   - New body: `Built from Eastman Tritan™ TX1001. BPA-free and dishwasher safe.`
   - Reason: unsubstantiable for a molded plastic product.

3. Change the heading `Pilr will upgrade your Focus` to `Your routine, intact.`

---

## Part 3 — sources list

At the bottom of the new page, above the footer, add a small sources
list in muted text at roughly 12px. Every stat on the page carries a
superscript number linking down to it. Keep this exact wording:

1. Council for Responsible Nutrition Consumer Survey, Ipsos, n=3,192 —
   https://www.crnusa.org/newsroom/three-quarters-americans-take-dietary-supplements-most-users-agree-they-are-essential
2. Liu et al., *Nutrients* 2024;16(12):1830, NHANES 2011–2018, n=12,529 —
   https://pubmed.ncbi.nlm.nih.gov/38931186/
3. Petersen et al., *Clinical Infectious Diseases* 2007;45(7):908–915, n=245 —
   https://academic.oup.com/cid/article/45/7/908/543553
4. Transportation Security Administration, powders policy —
   https://www.tsa.gov/travel/frequently-asked-questions/what-policy-powders-are-they-allowed

Add the same superscript-plus-footnote treatment to the two stats in
the new home page section, with the sources list in the home page
footer area.

---

## Do not

- Do not invent, round, or restate any statistic differently than above.
- Do not describe the organizer study as being about supplements or
  travel. It is a medication adherence study. The page never says
  otherwise.
- Do not add testimonials, reviews, star ratings, or customer quotes.
  There are no customers yet.
- Do not add a comparison table against competitors.
- Do not use localStorage or any browser storage.
- Do not change any other page, the checkout, or the product data.

## When done

List the files you created and changed, and note anything in the
existing theme you had to work around.
