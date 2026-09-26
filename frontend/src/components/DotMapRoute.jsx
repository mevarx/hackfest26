// The dot-map route graphic — the one illustrative device the reference allows
// ("the dot-density technique is the only illustrative device"), applied to the
// skill-to-role path instead of a globe.
//
// Everything below builds `<circle>` elements and nothing else: no line, no
// path, no filled shape. The metro line is drawn by where the dots are, and the
// route reads as a route because it steps.
//
// The field is generated from fixed seeds rather than `Math.random()`: a
// randomised field would re-roll on every re-render (a visible flicker) and
// would differ between a server render and its hydration.

const VIEW_WIDTH = 1200
const VIEW_HEIGHT = 320

/** Path ink is Chalk at full opacity; background field is Card Slate at reduced
 *  opacity. Both are the reference's own values for this graphic. */
const PATH_RADIUS = 2.4
const FIELD_STEP_X = 19
const FIELD_STEP_Y = 17
const FIELD_JITTER = 12
const FIELD_CLEARANCE = 15

/* The field's treatment is the one place in this file that is a judgement
 * rather than a transcription, for two measurable reasons.
 *
 * The reference says the background field is Card Slate "at reduced opacity"
 * and offers 0.5. On a #101010 canvas that composites to about #252a2f — a
 * contrast ratio against the page of roughly 1.4:1, which is below the
 * threshold where a mark reads as texture at all. The sampled result was a
 * uniform grey haze with no visible lattice, so the route floated on an empty
 * plane.
 *
 * Full opacity fixes the level: Card Slate at #3b3d45 sits at about 4.3:1,
 * clearly present as a lattice and still an order of magnitude below the Chalk
 * route at #f3f3f3. The second fix is size — the field dots are sub-pixel at
 * this viewBox scale (1.1-1.8 units over a 1200-unit box shown at 1440px), so
 * they anti-aliased away even at the right colour. Lifting the floor to 1.5
 * units gives them enough area to survive the raster.
 */
const FIELD_OPACITY = 1
const FIELD_RADIUS_MIN = 1.5
const FIELD_RADIUS_RANGE = 0.7

const ROUTE_STEP = 9
const ROUTE_JITTER = 2.6

const LABEL_SIZE = 11
/** Input is a monospace, so every glyph advances the same distance. Estimating
 *  the run at 0.6em is enough to punch the field dots out from behind the type
 *  without measuring text in the DOM. */
const LABEL_ADVANCE = LABEL_SIZE * 0.6

// The route itself: a horizontal transit line that steps up and down rather than
// running straight, so it cannot be mistaken for a rule. Each named node sits on
// a corner of this polyline; the labelled y is 46 units above it, which is the
// clearance the shallow steps leave free.
const ROUTE_POINTS = [
  [-16, 256],
  [96, 256],
  [250, 288],
  [392, 224],
  [520, 264],
  [712, 264],
  [900, 216],
  [1096, 208],
  [1216, 208],
]

// `x`/`y` is the station on the line; `lx`/`ly` is where its label sits, 46
// units clear of the route. The end stations push their labels outwards so the
// run never touches the viewport edge. `bright` marks the destination cluster.
/**
 * @type {{ label: string, x: number, y: number, lx: number, ly: number, anchor: 'start' | 'middle' | 'end', bright?: boolean }[]}
 */
const ROUTE_NODES = [
  { label: 'MANUAL TESTER', x: 96, y: 256, lx: 40, ly: 210, anchor: 'start' },
  { label: 'SKILLS PROVEN', x: 392, y: 224, lx: 392, ly: 178, anchor: 'middle' },
  { label: 'PAID BRIDGE', x: 712, y: 264, lx: 712, ly: 218, anchor: 'middle' },
  { label: 'NEW ROLE', x: 1096, y: 208, lx: 1152, ly: 162, anchor: 'end', bright: true },
]

/** Mulberry32: a 32-bit integer run through a small generator. Same seed, same
 *  sequence, every time — which is what makes the illustration stable. */
function createRandom(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value) {
  return Math.round(value * 100) / 100
}

function distanceToRoute(x, y) {
  let nearest = Number.POSITIVE_INFINITY
  for (let i = 0; i < ROUTE_POINTS.length - 1; i += 1) {
    const [ax, ay] = ROUTE_POINTS[i]
    const [bx, by] = ROUTE_POINTS[i + 1]
    const dx = bx - ax
    const dy = by - ay
    const span = dx * dx + dy * dy
    const t =
      span === 0 ? 0 : clamp(((x - ax) * dx + (y - ay) * dy) / span, 0, 1)
    const cx = ax + t * dx
    const cy = ay + t * dy
    nearest = Math.min(nearest, Math.hypot(x - cx, y - cy))
  }
  return nearest
}

/** The rectangle the field dots have to stay out of, so the labels sit on clear
 *  canvas rather than on a texture. Derived from the label strings. */
const LABEL_BOXES = ROUTE_NODES.map((node) => {
  const run = node.label.length * LABEL_ADVANCE
  const left =
    node.anchor === 'start'
      ? node.lx
      : node.anchor === 'end'
        ? node.lx - run
        : node.lx - run / 2
  return {
    left: left - 10,
    right: left + run + 10,
    top: node.ly - LABEL_SIZE - 6,
    bottom: node.ly + 6,
  }
})

function insideAnyBox(x, y) {
  return LABEL_BOXES.some(
    (box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom,
  )
}

/** Background field: a jittered lattice, Card Slate at reduced opacity, thinning
 *  out near the route so the two dot populations read as separate inks. */
const FIELD_DOTS = (() => {
  const random = createRandom(0x5eed)
  const dots = []
  for (let y = 8; y < VIEW_HEIGHT - 4; y += FIELD_STEP_Y) {
    for (let x = 8; x < VIEW_WIDTH - 4; x += FIELD_STEP_X) {
      const cx = x + (random() - 0.5) * FIELD_JITTER
      const cy = y + (random() - 0.5) * FIELD_JITTER
      if (cx < 0 || cx > VIEW_WIDTH || cy < 0 || cy > VIEW_HEIGHT) continue
      if (distanceToRoute(cx, cy) < FIELD_CLEARANCE) continue
      if (insideAnyBox(cx, cy)) continue
      dots.push({
        x: round(cx),
        y: round(cy),
        r: round(FIELD_RADIUS_MIN + random() * FIELD_RADIUS_RANGE),
      })
    }
  }
  return dots
})()

/** The transit line: one dot every 9 units of arc length, nudged off the
 *  centreline so the spacing is not mechanical. */
const ROUTE_DOTS = (() => {
  const random = createRandom(0x1007)
  const dots = []
  let phase = 0
  for (let i = 0; i < ROUTE_POINTS.length - 1; i += 1) {
    const [ax, ay] = ROUTE_POINTS[i]
    const [bx, by] = ROUTE_POINTS[i + 1]
    const dx = bx - ax
    const dy = by - ay
    const length = Math.hypot(dx, dy)
    const ux = dx / length
    const uy = dy / length
    for (let s = phase; s < length; s += ROUTE_STEP) {
      const offset = (random() - 0.5) * 2 * ROUTE_JITTER
      dots.push({
        x: round(ax + ux * s - uy * offset),
        y: round(ay + uy * s + ux * offset),
        r: PATH_RADIUS,
      })
    }
    phase = (((phase - length) % ROUTE_STEP) + ROUTE_STEP) % ROUTE_STEP
  }
  return dots
})()

/** Node markers: a denser, slightly larger patch at each corner of the line, so
 *  a station is a change in density rather than an added symbol. NEW ROLE is
 *  packed tighter still — the reference asks for a *bright* cluster there. */
const CLUSTER_DOTS = (() => {
  const random = createRandom(0xc1a5)
  const dots = []
  for (const node of ROUTE_NODES) {
    const bright = node.bright === true
    const radiusX = bright ? 40 : 34
    const radiusY = bright ? 30 : 26
    const step = bright ? 6 : 7
    const jitter = bright ? 2 : 1.6
    const radius = bright ? 3 : 2.6
    dots.push({ x: node.x, y: node.y, r: radius + 1 })
    for (let dy = -radiusY; dy <= radiusY; dy += step) {
      for (let dx = -radiusX; dx <= radiusX; dx += step) {
        if ((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY) > 1.2) continue
        dots.push({
          x: round(node.x + dx + (random() - 0.5) * jitter),
          y: round(node.y + dy + (random() - 0.5) * jitter),
          r: radius,
        })
      }
    }
  }
  return dots
})()

// The graphic is decorative, so the SVG itself is hidden from assistive tech and
// the route is stated once as text instead.
const ROUTE_SENTENCE = `Route: ${ROUTE_NODES.map((node) => node.label.toLowerCase()).join(' → ')}`

/**
 * Dot-map route graphic: the full-width hero illustration, built from circles
 * alone. It is meant to sit flush with the bottom of the hero and be cropped
 * there, so the element keeps the viewBox's own ratio (`h-auto`) unless a caller
 * pins a shorter box — at which point `slice` crops the top rather than
 * letterboxing, which is how the bleed reads.
 *
 * Labels are SVG `<text>` rather than an HTML overlay: they are anchored to dot
 * positions, and because the box is allowed to crop, an overlay's percentages
 * would drift off their cluster while the text inside the viewBox cannot.
 *
 * @param {{ className?: string }} props
 */
export default function DotMapRoute({ className = '' }) {
  return (
    <figure>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        width="100%"
        preserveAspectRatio="xMidYMax slice"
        role="presentation"
        aria-hidden="true"
        className={`block h-auto w-full ${className}`.trim()}
      >
        <g style={{ fill: 'var(--color-card-slate)', fillOpacity: FIELD_OPACITY }}>
          {FIELD_DOTS.map((dot, index) => (
            <circle key={`field-${index}`} cx={dot.x} cy={dot.y} r={dot.r} />
          ))}
        </g>
        <g style={{ fill: 'var(--color-chalk)' }}>
          {ROUTE_DOTS.map((dot, index) => (
            <circle key={`route-${index}`} cx={dot.x} cy={dot.y} r={dot.r} />
          ))}
          {CLUSTER_DOTS.map((dot, index) => (
            <circle key={`cluster-${index}`} cx={dot.x} cy={dot.y} r={dot.r} />
          ))}
        </g>
        {/* Input 13px at the reference's meta scale, uppercase and tracked out.
            Sizes are in viewBox units so the type tracks the dots through the
            bleed crop; 11 units lands on ~13px at a 1440px viewport. */}
        <g
          style={{
            fill: 'var(--color-smoke)',
            fontFamily: 'var(--font-input)',
            fontSize: LABEL_SIZE,
            letterSpacing: '0.08em',
          }}
        >
          {ROUTE_NODES.map((node) => (
            <text key={node.label} x={node.lx} y={node.ly} textAnchor={node.anchor}>
              {node.label}
            </text>
          ))}
        </g>
      </svg>
      <figcaption className="sr-only">{ROUTE_SENTENCE}</figcaption>
    </figure>
  )
}
