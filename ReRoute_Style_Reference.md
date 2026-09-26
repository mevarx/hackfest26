# ReRoute — Style Reference
> A blueprint scratched into obsidian. Type and hairline borders carve white space from pure black, with a single amber compass-mark to show the active step.

**Theme:** dark (primary), with a light "paper" surface reserved for readable long-form panels

Adapted from the Hyperstudio editorial-tech system for ReRoute — Career Orchestration (SAP Hackfest 2026). Source measurements are interpreted for this product's actual components (agent pipeline log, stage progression, Ghost Twin audit, session transcript). This file replaces prior ad-hoc styling — treat it as the single source of truth going forward.

Hyperstudio's core discipline is what ReRoute currently lacks: hierarchy through type and hairlines, not through color-coded boxes. This system carries that discipline over, replacing every bordered status pill, every numbered dashboard row, and every competing accent color with one calm, editorial voice. Weight 400 does the talking. One amber dot marks the one thing that matters right now.

---

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Obsidian | `#0D0D0D` | `--color-obsidian` | Page canvas, header, and every dark surface — the default state |
| Carbon | `#070707` | `--color-carbon` | Deepest surface level — hero band, Ghost Twin panel background |
| Paper | `#FAFAF8` | `--color-paper` | Light "reading" surface reserved for long-form stage content and the demo persona card |
| Chalk | `#F3F3F1` | `--color-chalk` | Primary text on dark surfaces |
| Ink | `#141414` | `--color-ink` | Primary text on light (Paper) surfaces |
| Smoke | `#9C9C99` | `--color-smoke` | Secondary/muted text, captions, timestamps, helper copy — on dark surfaces |
| Slate | `#6B6B68` | `--color-slate` | Secondary/muted text on light (Paper) surfaces |
| Graphite | `#212120` | `--color-graphite` | Primary 1px border/divider color on dark surfaces — the structural line work |
| Fog | `#E4E4E1` | `--color-fog` | Primary 1px border/divider color on light surfaces |
| Signal White | `#FFFFFF` | `--color-signal-white` | Filled pill button on dark surfaces (Run Pipeline), inverted text on Ink buttons |
| Signal Black | `#0D0D0D` | `--color-signal-black` | Filled button on light surfaces (Build Route) |
| Compass Amber | `#F5A623` | `--color-compass-amber` | The ONE accent. Active-stage dot, single primary CTA per view, focus ring. Never a fill, never a background, never more than one instance per viewport |
| Pulse Dot | `#8AA98A` | `--color-pulse` | Small live-status dot only — muted sage, not a bright "success green," so it doesn't compete with amber |

---

## Tokens — Typography

### Display / Editorial — Serif, weight 400 only. Headlines, section openers, the "Kavya · 29 · Chennai" persona line. Authority through scale, never through bold. · `--font-editorial`
- **Family:** Noto Serif (substitute: Source Serif 4, Cambria, Georgia)
- **Weights:** 400 only for headlines; italic 400 for the secondary headline clause ("*in sequence.*")
- **Sizes:** 18px, 21px, 23px, 34px, 44px, 63px
- **Line height:** 1.03–1.10 at display sizes
- **Letter spacing:** -0.31px at 44px, -0.69px at 63px

### Utility — Sans, weight 400–500. Body copy, labels, buttons, form fields, the agent pipeline log. · `--font-utility`
- **Family:** Inter (substitute: General Sans, Söhne)
- **Weights:** 400 (body), 500 (labels, agent names, button text — never 700)
- **Sizes:** 12px, 13px, 14px, 16px, 18px
- **Line height:** 1.25–1.5
- **Letter spacing:** 0.04em on small-caps labels (STAGE 01 · SKILLS DISCOVERY), default elsewhere

### Mono — Meta text only. Timestamps in the agent log, session IDs, source tags. · `--font-mono`
- **Family:** IBM Plex Mono (substitute: JetBrains Mono, Space Mono)
- **Weights:** 400
- **Sizes:** 11px, 12px
- **Letter spacing:** -0.02em
- **Role:** Never used for headlines or body copy — reserved strictly for timestamps and IDs, giving them a quiet "system log" feel without turning the whole UI into a terminal.

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|-----------------|-------|
| meta | mono | 400 | 12px | 1.4 | -0.02em | `--text-meta` |
| caption | sans | 400 | 13px | 1.5 | 0.04em (uppercase) | `--text-caption` |
| body | sans | 400 | 16px | 1.5 | — | `--text-body` |
| label | sans | 500 | 14px | 1.3 | — | `--text-label` |
| heading-sm | serif | 400 | 23px | 1.15 | — | `--text-heading-sm` |
| heading | serif | 400 | 34px | 1.08 | — | `--text-heading` |
| heading-lg | serif | 400 | 44px | 1.07 | -0.31px | `--text-heading-lg` |
| display | serif | 400 | 63px | 1.05 | -0.69px | `--text-display` |

---

## Tokens — Spacing & Shapes

**Base unit:** 4px
**Density:** comfortable — generous section gaps, not a dense dashboard

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 24 | 24px | `--spacing-24` |
| 40 | 40px | `--spacing-40` |
| 64 | 64px | `--spacing-64` |
| 96 | 96px | `--spacing-96` |

### Border Radius

| Element | Value |
|---------|-------|
| tags / small controls | 4px |
| cards / panels | 8px |
| form inputs | 6px |
| primary buttons | 9999px (pill) — the ONLY fully-rounded element in the system |

### Layout

- **Page max-width:** 1120px
- **Reading column max-width:** 640px (body copy, manifesto-style paragraphs)
- **Section gap:** 96–160px
- **Panel padding:** 32–48px
- **Element gap:** 16–24px

---

## Components

### Top Navigation Bar
**Role:** Persistent header — brand, demo-mode state, slice indicator

Obsidian background, 1px Graphite bottom border, no shadow. Left: square logomark (Chalk "R" on Obsidian tile, or inverted) + "ReRoute" in serif 18px + "CAREER ORCHESTRATION" caption below in Smoke, letter-spaced. Right: plain text meta ("RE ROUTE · HACKFEST DEMO") in Smoke mono/caption, a minimal toggle switch (no colored track — Graphite off, Chalk-outlined on) labeled "DEMO MODE", and a plain text "SLICE 04" — no bordered pill around it.

### Hero Headline Block
**Role:** Page/section opener

Serif 63px weight 400, Ink on Paper (or Chalk on Obsidian), line-height 1.05, letter-spacing -0.69px. Second line in italic serif, Slate/Smoke color, same size — this is how "in sequence." reads quieter than "Every agent,". Sub-headline below in sans 16px body, Slate, max-width 640px. No decoration, no icon, no background shift behind the text.

### Demo Persona Card
**Role:** Shows the active demo subject (Kavya)

Paper background even inside a dark page (deliberate — this is the one card allowed to invert), 1px Fog border, 8px radius, one 2px Compass Amber left-edge accent bar (not a full border — a single vertical stroke on the left edge only). Caption label "DEMO PERSONA" in small-caps Slate. Name line in serif 23px Ink. Description in sans body, Slate. No icon, no photo.

### Session Transcript Panel
**Role:** Displays the raw input text (voice/paste) that feeds the pipeline

Plain content on the page background — no card border unless it's the active editable textarea. The textarea itself: 1px Fog/Graphite border, 6px radius, sans body text, generous padding (16-20px), resize handle visible but understated. Label above in caption style, helper line below in Slate/Smoke, one sentence, no icon.

### Primary Button — "Run Pipeline" / "Build Route"
**Role:** The single primary action per view

On dark surfaces: filled Signal White pill is reserved for the *most* primary global action; for a page-local primary action (Run Pipeline, Build Route) use a solid Ink/Obsidian-filled rounded-rect (6-8px radius, NOT full pill — pills are reserved for the one top-level CTA) with Chalk text, sans 14px weight 500, uppercase, 12px 24px padding. Only ONE such filled button visible per viewport. A second action on the same view is always the Ghost Outline style below — never two filled buttons side by side.

### Ghost Outline Button (Secondary)
**Role:** Secondary action beside a primary one

Transparent background, 1px Ink/Chalk border (matches current text color), same text color, 6px radius, 10px 20px padding, sans 14px weight 500, uppercase. No fill, no hover-fill — on hover, only the border opacity increases.

### Status Line (replaces bordered "RUNNING/DONE" pills)
**Role:** Communicates agent/task state inline, without a badge

No box, no border, no background fill. Rendered as: a 6px dot + one word, inline with the surrounding text, in the *same* font weight as adjacent copy.
- `running` → outlined dot, slow opacity pulse (1.5s cycle), word "running" in Smoke
- `done` → filled Pulse Dot (muted sage) dot, word "done" in Chalk/Ink (not colored — the dot alone carries the state)
- `waiting` → outlined dot with a thin Amber ring (the one exception where amber may repeat per row, since "waiting for consent" is a genuinely blocking, singular state) + word in Chalk/Ink
This is the direct replacement for the bordered pill list in the current agent log — same information, zero visual weight added.

### Source Tag (replaces "LIVE / SIMULATED / SOURCE PENDING" pills)
**Role:** Marks whether data is real, mocked, or local

Plain mono 12px text, Smoke color, no border, no background:
- `live` → "· live" appended after the content, small filled dot before it
- `simulated` → "· simulated" in Smoke, small outlined dot
- `local` → "· local" in Smoke, no dot
- `pending` → "source pending" with a dotted underline under the words themselves (no box at all)

### Agent Pipeline Log (Timeline)
**Role:** Replaces the numbered (01, 02, 03…) bordered-row list

A single 1px Graphite vertical line on the left. Each entry is a small dot on that line (outline = pending, filled Pulse = done, pulsing outline = running). To the right: agent name in sans 14px weight 500, message in sans 14px weight 400 Smoke, directly below or inline. Timestamp in mono 11px Smoke, right-aligned. No per-row border, no per-row background, no numbering. Reads like a commit log, not a dashboard grid.

### Stage Progression
**Role:** The 4-step Understand → Plan → Match → Audit indicator

A single 1px Graphite horizontal line spanning the row. Small dots at each stage: current stage dot filled Compass Amber (the one intentional accent use on this component), completed stages filled Chalk/Ink, upcoming stages outline only. Stage label below each dot in caption style — current stage label in full text-color weight 500, others in Slate/Smoke weight 400. No large standalone numerals (01/02/03/04) as independent typography — if a number is needed, fold it into the caption label at reduced size.

### Ghost Twin Audit Panel
**Role:** The editable candidate-attribute form + live re-run

Carbon background (deepest surface — this panel is the product's signature moment and earns slightly more visual weight than everything else). Fields use the standard form-input style below. The "RUN AUDIT" / "RE-RUN AUDIT" button is the one filled primary button on this view; a toggle ("Simulate legacy ATS") uses the minimal switch style from the nav bar, not a colored track. Result renders as a plain comparison list (candidate vs. twins) with Status Line dots for PASS/FLAGGED — never a colored banner box.

### Form Input (Select / Text / Number)
**Role:** All form fields — From Skill, Target Role, Hours per Week, Ghost Twin attribute editors

1px Fog (light) or Graphite (dark) border, 6px radius, sans body text, 10-12px vertical padding. Custom chevron for selects (no native browser arrow), custom or hidden spinner for number inputs. Focus state: border becomes Compass Amber, 1px — this is the ONLY place amber appears as a border, and only while actively focused. No permanent colored borders on any field.

### Section Divider
**Role:** Separates major sections

1px solid Graphite (dark) or Fog (light) line, full content width, no gradient or fade. Used instead of background-color shifts between sections — sections are separated by space and a hairline, never by a new background tint.

### Footer
**Role:** Closes the page

1px Graphite top border, transparent background, generous 32-40px vertical padding. Plain sans 14px text for links/meta, mono 12px Smoke for secondary/build info. No background fill.

---

## Do's and Don'ts

### Do
- Use weight 400 for every headline, weight 500 (max) for labels and buttons — never bold/700 anywhere in the interface.
- Separate every section with a single 1px hairline. No alternating background bands.
- Use full pill radius (9999px) only for the single top-level primary CTA in the nav bar. Everything else stays 4-8px.
- Show state (running/done/waiting/live/simulated) as a dot + plain text inline — never as a bordered, filled, colored capsule.
- Reserve Compass Amber for exactly one element per screen: the current-stage dot, the one primary button, or an active focus ring. If you can count two amber elements in one viewport, remove one.
- Let the vertical timeline line + dots carry the agent log's structure — no row numbering, no per-row borders.
- Keep muted text in Smoke/Slate, never pure mid-gray — the slight warm-neutral tilt matches the paper/obsidian pairing.

### Don't
- Never add a drop shadow. Elevation comes from the Carbon/Obsidian/Paper surface steps and hairline borders only.
- Never use two filled/solid buttons in the same viewport — one primary action, everything else is Ghost Outline or plain text.
- Never render a status as a bordered pill with a background fill. That pattern is explicitly retired.
- Never use amber as a background fill or a repeated per-row accent (the single "waiting" ring is the one exception, because it marks a true blocking state, not routine status).
- Never mix more than two typefaces on one screen (serif for display, sans for everything else, mono only for timestamps/IDs).
- Never give every card the same treatment — most content sits on bare background separated by hairlines; actual bordered cards are reserved for the persona card and the Ghost Twin panel.
- Never use large standalone numerals (01/02/03) as decorative typography — numbers are metadata, not headlines.

---

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Obsidian Canvas | `#0D0D0D` | Base dark page background, nav bar |
| 0 (light) | Paper | `#FAFAF8` | Base light page background, persona card, reading sections |
| 1 | Carbon Depth | `#070707` | Ghost Twin panel, deepest/most important interactive surface |
| 2 | Hairline Grid | `#212120` / `#E4E4E1` | 1px border/divider lines that define every boundary in the system |

## Elevation

No drop shadows anywhere. Elevation is entirely hairline-and-contrast based: the Ghost Twin panel reads as "elevated" because it sits on Carbon (darker than Obsidian) with the same 1px border discipline — depth through value shift, not blur. The only visual "lift" in the whole system is the single filled primary button per screen, and that lift is pure color contrast.

## Imagery

No photography, no illustration, no icon library beyond the wordmark tile. The stage-progression dots-and-line and the timeline dots-and-line are the only recurring graphic motifs — both are typographic/structural, not decorative. Whitespace and type carry the product; nothing is added purely for visual interest.

## Layout

Full-bleed Obsidian/Paper canvas per section, content constrained to a 1120px max-width column. Hero is left-aligned (not centered — this is a working tool, not a landing page manifesto) with the persona card breaking into view directly below at a narrower reading width. Sections separated exclusively by hairline dividers and generous vertical space (96-160px), never by background-color banding. The agent pipeline log and stage progression are full-width within the content column; forms and panels (Ghost Twin, Route Builder) cap at a slightly narrower width for readability. Navigation is a fixed hairline-bordered bar, not sticky-elevated with shadow.

---

## Agent Prompt Guide

**Primary action color:** Compass Amber (`#F5A623`) — used once per screen, never repeated.

### Quick Color Reference
- Dark canvas: `#0D0D0D`
- Light canvas: `#FAFAF8`
- Primary text (dark bg): `#F3F3F1`
- Primary text (light bg): `#141414`
- Muted text: `#9C9C99` (dark) / `#6B6B68` (light)
- Border: `#212120` (dark) / `#E4E4E1` (light)
- Accent (single use only): `#F5A623`
- Status dot (done): `#8AA98A`

### Example Component Prompts

1. **Hero headline block**: Paper (#FAFAF8) or Obsidian (#0D0D0D) background. First line serif 63px weight 400, color Ink/Chalk, letter-spacing -0.69px, line-height 1.05. Second line same size in italic serif, color Slate/Smoke. Sub-headline below in sans 16px, Slate, max-width 640px. No icon, no button in the hero itself.

2. **Agent log timeline entry**: No card, no border. A 6px dot on a 1px vertical Graphite line (filled sage `#8AA98A` if done, pulsing outline if running). Agent name in sans 14px weight 500 to the right, message in sans 14px weight 400 Smoke below it, timestamp in mono 11px Smoke right-aligned.

3. **Stage progression dot**: 1px Graphite horizontal line. Current stage: 10px filled Compass Amber (#F5A623) circle. Other stages: 10px outline circle, Graphite stroke. Caption label below each in small-caps, current stage weight 500 in main text color, others weight 400 in Smoke.

4. **Primary button (Run Pipeline)**: Solid Ink (#141414) or Obsidian fill depending on surface, Chalk (#F3F3F1) text, 6-8px radius (not full pill), sans 14px weight 500 uppercase, 12px 24px padding. Only one per screen.

5. **Source tag**: No box. Mono 12px text, Smoke color: a small filled dot + "live", or an outline dot + "simulated", or a dotted underline under "source pending" with no dot at all.

6. **Form input focus state**: 1px border, default Fog/Graphite at rest, transitions to 1px Compass Amber only while the field has focus. No permanent colored border on any field.

### Similar Brands / References
- **Hyperstudio** — the direct source: obsidian canvas, hairline structure, weight-400 authority, single-accent discipline
- **Linear** — status-as-dot-plus-text rather than colored pill badges, restrained single-accent product UI
- **Vercel Dashboard** — dark canvas, hairline card borders, monospace reserved strictly for metadata
- **Arc Browser (marketing site)** — editorial serif headlines paired with a minimal utility sans, generous section rhythm

---

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-obsidian: #0D0D0D;
  --color-carbon: #070707;
  --color-paper: #FAFAF8;
  --color-chalk: #F3F3F1;
  --color-ink: #141414;
  --color-smoke: #9C9C99;
  --color-slate: #6B6B68;
  --color-graphite: #212120;
  --color-fog: #E4E4E1;
  --color-signal-white: #FFFFFF;
  --color-signal-black: #0D0D0D;
  --color-compass-amber: #F5A623;
  --color-pulse: #8AA98A;

  /* Typography — Families */
  --font-editorial: 'Noto Serif', 'Source Serif 4', Georgia, serif;
  --font-utility: 'Inter', 'General Sans', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;

  /* Typography — Scale */
  --text-meta: 12px;
  --text-caption: 13px;
  --text-body: 16px;
  --text-label: 14px;
  --text-heading-sm: 23px;
  --text-heading: 34px;
  --text-heading-lg: 44px;
  --tracking-heading-lg: -0.31px;
  --text-display: 63px;
  --tracking-display: -0.69px;

  /* Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-24: 24px;
  --spacing-40: 40px;
  --spacing-64: 64px;
  --spacing-96: 96px;

  /* Layout */
  --page-max-width: 1120px;
  --reading-max-width: 640px;
  --section-gap: 96px;
  --panel-padding: 40px;

  /* Border Radius */
  --radius-tag: 4px;
  --radius-card: 8px;
  --radius-input: 6px;
  --radius-pill: 9999px;
}
```

### Tailwind v4

```css
@theme {
  --color-obsidian: #0D0D0D;
  --color-carbon: #070707;
  --color-paper: #FAFAF8;
  --color-chalk: #F3F3F1;
  --color-ink: #141414;
  --color-smoke: #9C9C99;
  --color-slate: #6B6B68;
  --color-graphite: #212120;
  --color-fog: #E4E4E1;
  --color-compass-amber: #F5A623;
  --color-pulse: #8AA98A;

  --font-editorial: 'Noto Serif', Georgia, serif;
  --font-utility: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;

  --text-meta: 12px;
  --text-caption: 13px;
  --text-body: 16px;
  --text-label: 14px;
  --text-heading-sm: 23px;
  --text-heading: 34px;
  --text-heading-lg: 44px;
  --text-display: 63px;

  --radius-tag: 4px;
  --radius-card: 8px;
  --radius-input: 6px;
  --radius-pill: 9999px;
}
```

---

## Migration notes (from current build)

- Delete every bordered pill Badge variant. Replace with the **Status Line** and **Source Tag** patterns above (dot + inline text, no box).
- Delete the numbered (01, 02, 03…) styling in the agent log. Replace with the **Agent Pipeline Log (Timeline)** component.
- Reduce the stage-progression component's large standalone numerals to small captions per **Stage Progression** above.
- Audit every screen for accent-color count. Amber should appear at most once per viewport outside of the "waiting" ring exception.
- Consolidate all buttons into exactly two variants: filled primary (one per screen) and Ghost Outline (everything else). Remove any third button style currently in the codebase.
- Apply the Compass Amber focus ring to form inputs and remove any permanent colored borders on form containers.
