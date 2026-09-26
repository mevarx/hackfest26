# ReRoute — Style Reference (Hyperstudio Ditto)
> A blueprint scratched into obsidian. Type and hairline borders carve white space from pure black, with the occasional gold compass-mark to show the way.

**Theme:** dark

This is a literal 1:1 port of the Hyperstudio design system — same tokens, same component specs, same button gloss, same badge shape, same dot-graphic motif — with ReRoute's content substituted in. Do not reinterpret or "improve" anything below; build it exactly as specified. Where Hyperstudio had a marketing-site element with no ReRoute equivalent, the mapping is stated explicitly so nothing is invented.

ReRoute runs on the same near-black canvas where everything is carved out by light. Deep matte black background (#101010), crisp off-white type (#f3f3f3), hairline 1px borders (#212121), and the occasional warm gold or signal-green dot for punctuation. Typography does the heavy lifting — oversized 400-weight headlines with aggressive negative tracking create a quiet, confident voice, never shouting. Components are reduced to their skeleton: outlined buttons, one glossy primary pill, thin dividers, no shadows beyond the button's own bevel, no fills beyond that single pill. The whole system feels like a wireframe rendered in light on obsidian — restrained, precise, deliberate.

---

## Content Mapping (Hyperstudio → ReRoute)

| Hyperstudio element | ReRoute equivalent |
|---|---|
| "Hyperstudio" wordmark | "ReRoute" wordmark + "CAREER ORCHESTRATION" subtitle underneath, small caps, Smoke |
| Nav links: SERVICES / PORTFOLIO / PROCESS | Nav links: PIPELINE / ROUTE MAP / AUDIT |
| "LET'S CHAT" glossy pill (top right) | "RUN PIPELINE" glossy pill (top right) |
| Scarcity badge "● 2/5 SPOTS LEFT FOR OCTOBER" | Status badge "● SLICE 04 · DEMO MODE ON" |
| Headline "World-class branding and websites for startups." | Headline "Every agent, in sequence." (second line italic, Smoke) |
| Primary CTA "START NOW ↗" | Primary CTA "RUN PIPELINE ↗" |
| Secondary CTA "VIEW WORK ↓" | Secondary CTA "VIEW ROUTE ↓" |
| Dot-map world graphic (globe made of dots) | Dot-map route graphic (the Kavya skill-to-role path made of dots — see below) |
| Service Card grid (2×2) | Pipeline Agent grid (2×3: Skills Discovery, Market Intelligence, Learning Pathway, Inclusive Matching, Employer Readiness, Bias Audit) |
| Portfolio Card | Session Card (a past demo run — persona, outcome, date) |
| Manifesto block ("Why Hyperstudio?") | Manifesto block ("Why ReRoute?" — the Two-Key Rule, one paragraph) |
| Footer email | Footer: team + repo link |

---

## Tokens — Colors

*(unchanged from source — do not alter these values)*

| Name | Value | Token | Role |
|------|-------|-------|------|
| Obsidian | `#101010` | `--color-obsidian` | Page canvas, full-bleed dark background |
| Carbon | `#080808` | `--color-carbon` | Deepest surface level, hero band, overlay backgrounds |
| Chalk | `#f3f3f3` | `--color-chalk` | Primary text, headings, body copy on dark surfaces |
| Smoke | `#9c9c9c` | `--color-smoke` | Secondary muted text, captions, helper labels |
| Ash | `#c1c1c1` | `--color-ash` | Mid-weight borders, subtle dividers, tertiary text |
| Graphite | `#212121` | `--color-graphite` | Primary 1px border color for cards, grids, section dividers |
| Iron | `#474747` | `--color-iron` | Secondary border and stroke detail |
| Signal White | `#ffffff` | `--color-signal-white` | Glossy pill button base, inverted text on light surfaces |
| Compass Gold | `#6f6759` | `--color-compass-gold` | Outlined icon strokes — warm metallic against the cool dark |
| Card Slate | `#3b3d45` | `--color-card-slate` | Card and panel border accent on elevated sections |
| Pulse Green | `#98ff38` | `--color-pulse-green` | Live/active status dot only (badge prefix) |

---

## Tokens — Typography

*(unchanged from source)*

### Aeonik — Primary typeface for everything. Weight 400 across all sizes is signature: no bold shouting, authority through scale and tracking alone. · `--font-aeonik`
- **Substitute:** Inter, Satoshi, or General Sans
- **Weights:** 400, 700
- **Sizes:** 13px, 14px, 16px, 17px, 18px, 21px, 23px, 34px, 44px, 63px
- **Line height:** 0.95–1.43
- **Letter spacing:** -0.0110em at 63px, -0.0070em at 44px, default at body
- **OpenType features:** `'ss01' on, 'cv11' on`

### Input — Secondary typeface for meta text, labels, captions. · `--font-input`
- **Substitute:** IBM Plex Mono, JetBrains Mono, or Space Mono
- **Weights:** 400
- **Sizes:** 8px, 13px, 14px, 16px, 17px, 18px
- **Line height:** 1.20–1.54
- **Letter spacing:** -0.0370em, -0.0220em

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|-----------------|-------|
| caption | 13px | 2.69 | — | `--text-caption` |
| body | 16px | 1.25 | — | `--text-body` |
| heading-xs | 18px | 1.31 | — | `--text-heading-xs` |
| subheading | 21px | 0.95 | — | `--text-subheading` |
| heading-sm | 23px | 1.07 | — | `--text-heading-sm` |
| heading | 34px | 1.03 | — | `--text-heading` |
| heading-lg | 44px | 1.07 | -0.31px | `--text-heading-lg` |
| display | 56–63px | 1.05 | -0.69px | `--text-display` |

---

## Tokens — Spacing & Shapes

**Base unit:** 4px · **Density:** comfortable

| Name | Value |
|------|-------|
| 4 | 4px |
| 8 | 8px |
| 12 | 12px |
| 16 | 16px |
| 20 | 20px |
| 24 | 24px |
| 40 | 40px |

### Border Radius

| Element | Value |
|---------|-------|
| tags / badges | 9999px (full pill, matches screenshot) |
| cards | 12px |
| primary/secondary buttons | 12–14px (rounded rect, NOT full pill — see button spec below, this matches the actual screenshot, not the earlier assumption) |
| icons | 99px |

### Layout

- **Page max-width:** 1200px
- **Section gap:** 120–210px
- **Card padding:** 32–48px
- **Element gap:** 20–24px

---

## Components — Exact Specs

### Top Navigation Bar
Transparent, floating over Obsidian canvas, no bottom border visible in the reference shot (hairline only appears once content scrolls under it — keep it borderless at the very top). Left: "ReRoute" wordmark, Aeonik 18px weight 500 Chalk, immediately followed by a thin vertical divider `|` in Iron, then nav links. Nav links: PIPELINE, ROUTE MAP, AUDIT — Aeonik 14px weight 400 uppercase, Smoke, 24px gaps, one link ("AUDIT") may carry a small superscript "NEW" tag in Compass Gold 10px if it's the newest feature. Right: the Glossy Pill Button (see below) labeled "RUN PIPELINE" with a small circular icon-avatar to its left inside the same pill (use the "R" logomark tile, dark-on-light, 24px circle).

### Glossy Pill Button (Primary Action)
**This is the exact button style from the screenshot — reproduce precisely:**
```css
background: linear-gradient(180deg, #ffffff 0%, #e9e9e6 100%);
color: #101010;
border-radius: 14px; /* rounded rect, not a full pill */
padding: 10px 20px 10px 10px; /* tighter left padding to fit the icon circle */
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.9),   /* top inner highlight = the glossy bevel */
  0 1px 2px rgba(0,0,0,0.4);              /* soft contact shadow, NOT a drop shadow halo */
font: 400 14px/1 'Aeonik', sans-serif;
letter-spacing: 0.02em;
text-transform: uppercase;
display: inline-flex;
align-items: center;
gap: 8px;
```
Icon-avatar circle sits inside the pill at the far left (24px diameter, dark fill, light glyph). No hover-color change — only a subtle brightness increase (~4%) on the gradient.

### Ghost Outline Button (Secondary Action)
```css
background: rgba(255,255,255,0.03);
border: 1px solid #2a2a2a;
color: #f3f3f3;
border-radius: 12px;
padding: 10px 20px;
font: 400 14px/1 'Aeonik', sans-serif;
text-transform: uppercase;
letter-spacing: 0.02em;
```
Small arrow glyph right-aligned inside the button ("↗" for forward actions, "↓" for reveal/scroll actions). No border-color change on hover — background lightens to `rgba(255,255,255,0.06)` only.

### Status/Scarcity Badge (Pill)
**Exact reproduction of "2/5 SPOTS LEFT FOR OCTOBER":**
```css
background: #1a1a1a;
border: 1px solid #212121;
border-radius: 9999px;
padding: 6px 14px;
display: inline-flex;
align-items: center;
gap: 8px;
font: 400 12px/1 'Input', monospace;
color: #9c9c9c;
text-transform: uppercase;
letter-spacing: 0.05em;
```
Prefix: a 6px solid-filled circle in Pulse Green (`#98ff38`) with a very subtle glow (`box-shadow: 0 0 4px rgba(152,255,56,0.5)`), vertically centered.
ReRoute content: `● SLICE 04 · DEMO MODE ON`

### Headline Display Block
Aeonik, weight 400, size 56–63px (scale down to 44px on tablet, 34px on mobile), color Chalk, line-height 1.05, letter-spacing -0.69px. Two lines, left-aligned (not centered — ReRoute is a working tool, the reference's centered marketing hero doesn't apply). Line 1: "Every agent," in full-weight Chalk. Line 2: "in sequence." in italic, Ash/Smoke color, same size. Sub-headline directly below: Aeonik 21px weight 400 Smoke, max-width 620px: "A transparent view of the orchestration backbone as ReRoute turns a career transition into a fair, evidence-led plan."

Below the sub-headline: the Status Badge, then the two buttons side by side (Glossy Pill primary "RUN PIPELINE ↗", Ghost Outline secondary "VIEW ROUTE ↓"), 16px gap between them.

### Dot-Map Route Graphic (replaces the world-map dot graphic)
Full-width illustration, positioned exactly where Hyperstudio's globe sits — spanning the viewport width, bleeding off the bottom edge of the hero section. Composed of small white/Chalk circular dots (`#f3f3f3` at full opacity for "path" dots, `#3b3d45` at reduced opacity for "background field" dots) forming the shape of a metro-line route: a horizontal path from left (labeled small-caps "MANUAL TESTER") through 2-3 intermediate nodes (denser dot clusters marking "SKILLS PROVEN" and "PAID BRIDGE") to a bright cluster on the right (labeled "NEW ROLE"), echoing the pitch deck's route motif but rendered entirely in dot-density rather than lines/icons. No stroke, no fill beyond dot density — same technique as the source globe, different subject.

### Pipeline Agent Card (2×3 Grid Cell)
**Replaces the 2×2 Service Card grid — same visual spec, one more cell:**
Transparent background, 1px Graphite border on bottom and sides (no top border, merges with section divider). Compass Gold outlined icon top-left, 32px (simple geometric glyphs: a checklist mark for Skills Discovery, a radar sweep for Market Intelligence, a compass/path for Learning Pathway, a handshake for Inclusive Matching, a building for Employer Readiness, a ghost/twin silhouette for Bias Audit). Heading Aeonik 14px weight 400 uppercase Chalk (agent name). Body Aeonik 14px weight 400 Smoke (one-line description, e.g. "Turns a 15-minute work sample into a verified credential."). 48px padding.

### Session Card (replaces Portfolio Card)
No background fill, 1px Graphite border/divider, 8px radius. Centered small outlined icon (a document/passport glyph). Persona name in Aeonik 16px weight 400 Chalk ("Kavya · 29 · Chennai"), category label below in Input 13px uppercase Smoke ("AUTOMATED TO HIRED · 10 WEEKS"). Tight vertical padding 24px.

### Manifesto Block ("Why ReRoute?")
Centered, max-width 600px. Title Aeonik 23px weight 400 Chalk: "Why ReRoute?" Body Aeonik 16px weight 400 Smoke, 24px line-height: "AI proposes, a human decides on every high-stakes step. Rejections, terminations and pay are never automated." Ghost Outline button below labeled "READ THE TWO-KEY RULE".

### Section Divider Line
1px solid Graphite (`#212121`), full content width. The single most repeated visual element — it IS the page structure. No gradients, no fades.

### Footer
1px Graphite top border, transparent background. Aeonik 14px Chalk: "Team ReRoute · SRM University AP". Input 13px Smoke secondary line: repo/link + "SAP Hackfest 2026". No background fill, 32px vertical padding.

---

## Do's and Don'ts

### Do
- Use weight 400 for all headings — never bold. Scale and tracking carry hierarchy.
- Separate every section with a 1px `#212121` hairline. No background color shifts between sections.
- Reproduce the Glossy Pill button's exact gradient + inset highlight — this bevel is what makes it look premium, not flat like a generic dark-mode button.
- Use rounded-rect (12–14px) buttons, NOT full pill radius, except on the status badge which IS full pill.
- Use `#6f6759` Compass Gold exclusively for icon strokes — never for text or backgrounds.
- Apply Pulse Green only for the single live-status dot in the badge.
- Keep all body text in `#9c9c9c` Smoke.
- Left-align the hero (not centered) since this is a product, not a marketing manifesto page.

### Don't
- Never add drop shadows beyond the button's own subtle contact shadow.
- Never use bold/semibold weight on display type.
- Never use a colored fill behind text.
- Never use full pill radius on cards or secondary buttons — only the badge and the primary Glossy Pill get that treatment (correcting the earlier assumption that all buttons were full pill).
- Never place icons in any color other than Compass Gold or Chalk.
- Never use literal photography — the dot-density technique is the only illustrative device, applied here to the route/skills path instead of a globe.
- Never break the 1200px content column.

---

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Obsidian Canvas | `#101010` | Base page background |
| 1 | Carbon Depth | `#080808` | Hero band, elevation, overlay depth |
| 2 | Hairline Grid | `#212121` | 1px border lines |

## Elevation
No drop shadows except the Glossy Pill button's own inset-highlight + soft contact shadow (see exact CSS above). Every other "lift" comes from hairline borders and contrast alone.

## Imagery
Near-zero photography. The only imagery is the dot-matrix route graphic — white/Chalk circular dots on Obsidian forming the skill-to-role path through density alone. Icons are the only other graphic motif: 1.5px outlined strokes in Compass Gold or Chalk, geometric and minimal.

## Layout
Full-bleed Obsidian canvas, content constrained to a 1200px max-width column. Hero is left-aligned with the dot-map route graphic bleeding full-width below it. Sections separated exclusively by 1px Graphite dividers. Pipeline Agent grid is 2×3 inside a bordered frame. Manifesto block is a narrow centered column. Navigation is transparent, no sticky shadow. Spacing 120–210px between sections.

---

## Agent Prompt Guide

### Quick Color Reference
- Canvas: `#101010`
- Primary text: `#f3f3f3`
- Muted text: `#9c9c9c`
- Border: `#212121`
- Icon stroke: `#6f6759`
- Primary button: gradient `#ffffff → #e9e9e6`, text `#101010`, radius `14px`
- Live-status dot: `#98ff38`

### Example Component Prompts

1. **Hero**: Obsidian background. Left-aligned headline, Aeonik 63px weight 400, `#f3f3f3`, letter-spacing -0.69px, line-height 1.05: "Every agent," then italic Smoke second line "in sequence." Sub-headline 21px Smoke below, max-width 620px. Status badge (pill, `#1a1a1a` bg, `#212121` border, Pulse Green dot, "SLICE 04 · DEMO MODE ON"). Two buttons: Glossy Pill "RUN PIPELINE ↗" + Ghost Outline "VIEW ROUTE ↓".

2. **Glossy Pill button**: `linear-gradient(180deg, #ffffff, #e9e9e6)` fill, `#101010` text, 14px radius, inset top highlight + soft contact shadow, 24px icon-avatar circle at the left inside the pill, Aeonik 14px uppercase.

3. **Pipeline Agent card**: Transparent bg, 1px `#212121` border (bottom+sides only). Compass Gold 32px outlined icon top-left. Heading Aeonik 14px uppercase `#f3f3f3`. Body Aeonik 14px `#9c9c9c`. 48px padding.

4. **Dot-map route graphic**: Full-width dot-density illustration on Obsidian. White dots at full opacity trace a horizontal metro-line path with 3 labeled node clusters (Manual Tester → Skills Proven / Paid Bridge → New Role); background field dots in muted `#3b3d45` at low opacity fill the negative space.

5. **Section divider**: Full-width 1px solid `#212121` line, zero margin — the line IS the layout.

---

## Quick Start

### CSS Custom Properties

```css
:root {
  --color-obsidian: #101010;
  --color-carbon: #080808;
  --color-chalk: #f3f3f3;
  --color-smoke: #9c9c9c;
  --color-ash: #c1c1c1;
  --color-graphite: #212121;
  --color-iron: #474747;
  --color-signal-white: #ffffff;
  --color-compass-gold: #6f6759;
  --color-card-slate: #3b3d45;
  --color-pulse-green: #98ff38;

  --font-aeonik: 'Aeonik', 'Inter', 'General Sans', ui-sans-serif, system-ui, sans-serif;
  --font-input: 'Input', 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;

  --text-caption: 13px;
  --text-body: 16px;
  --text-heading-xs: 18px;
  --text-subheading: 21px;
  --text-heading-sm: 23px;
  --text-heading: 34px;
  --tracking-heading-lg: -0.31px;
  --text-heading-lg: 44px;
  --text-display: 63px;
  --tracking-display: -0.69px;

  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-40: 40px;

  --page-max-width: 1200px;

  --radius-badge: 9999px;
  --radius-card: 12px;
  --radius-button: 14px;

  --button-gradient: linear-gradient(180deg, #ffffff 0%, #e9e9e6 100%);
  --button-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.4);
}
```

### Tailwind v4

```css
@theme {
  --color-obsidian: #101010;
  --color-carbon: #080808;
  --color-chalk: #f3f3f3;
  --color-smoke: #9c9c9c;
  --color-ash: #c1c1c1;
  --color-graphite: #212121;
  --color-iron: #474747;
  --color-compass-gold: #6f6759;
  --color-card-slate: #3b3d45;
  --color-pulse-green: #98ff38;

  --font-aeonik: 'Aeonik', 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-input: 'Input', 'IBM Plex Mono', ui-monospace, monospace;

  --text-caption: 13px;
  --text-body: 16px;
  --text-subheading: 21px;
  --text-heading-sm: 23px;
  --text-heading: 34px;
  --text-heading-lg: 44px;
  --text-display: 63px;

  --radius-badge: 9999px;
  --radius-card: 12px;
  --radius-button: 14px;
}
```

---

## Build Instructions for OpenCode

1. Do not invent new components. Every element above maps 1:1 to a Hyperstudio source element via the Content Mapping table — build exactly what's specified, in the exact order it appears in the reference screenshot (nav → badge → headline → sub-headline → buttons → dot graphic → agent grid → manifesto → footer).
2. The Glossy Pill button's gradient + inset highlight is the single most important visual detail to get right — it is what separates this from a flat "AI dashboard" button. Test it against the CSS block above pixel-for-pixel.
3. Remove every previously-built bordered status pill, numbered agent-log row, and multi-accent-color pattern from earlier iterations of this UI — none of that exists in this spec. The agent pipeline log becomes the "Pipeline Agent" 2×3 grid shown on the homepage; live run status (if shown at all on this page) uses the same Status Badge component, never a per-row pill.
4. Left-align the hero text block (the source Hyperstudio hero is centered because it's a marketing page; ReRoute's hero stays left-aligned per the Headline Display Block spec above, since underlying app pages already established left-alignment).
5. Ship the dot-map route graphic as inline SVG or canvas-rendered dots — do not use a raster image.
6. After building, compare side-by-side against the attached Hyperstudio homepage screenshot and this ReRoute spec: nav layout, badge shape, button gloss, headline weight/tracking, and dot-graphic density should all match structurally, with only the words and the illustrated subject (route path vs. globe) differing.
