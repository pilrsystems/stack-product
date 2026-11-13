import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import gsap from 'gsap'

// ── Supplement data ──────────────────────────────────────────
const SUPPLEMENTS = {
  powders: [
    { id: 'creatine',     label: 'Creatine' },
    { id: 'preworkout',   label: 'Pre-Workout' },
    { id: 'electrolytes', label: 'Electrolytes' },
    { id: 'collagen',     label: 'Collagen' },
    { id: 'greens',       label: 'Greens / AG1' },
    { id: 'bcaas',        label: 'BCAAs' },
    { id: 'other-powders', label: 'Other' },
  ],
  hybrid: [
    { id: 'fishoil',      label: 'Fish Oil / Omega-3' },
    { id: 'magnesium',    label: 'Magnesium' },
    { id: 'multivitamin', label: 'Multivitamin' },
    { id: 'ltheanine',    label: 'L-Theanine' },
    { id: 'other-hybrid', label: 'Other' },
  ],
  pills: [
    { id: 'vitamind',     label: 'Vitamin D3' },
    { id: 'zinc',         label: 'Zinc' },
    { id: 'coq10',        label: 'CoQ10' },
    { id: 'probiotic',    label: 'Probiotic' },
    { id: 'ashwagandha',  label: 'Ashwagandha' },
    { id: 'b12',          label: 'B12' },
    { id: 'vitaminc',     label: 'Vitamin C' },
    { id: 'turmeric',     label: 'Turmeric' },
    { id: 'other-pills',  label: 'Other' },
  ],
  // Not actual supplements — real, individually-purchasable products.
  // Reuses the same chip rendering/selection machinery as the categories
  // above (renderChips keys off SUPPLEMENTS[category] + selected[category]
  // generically), but unlike those, each one here maps straight to its own
  // full-price cart line in updateSummary/the Add to Cart handler — see
  // ADD_ONS below for price/image, kept separate since renderChips only
  // needs id + label.
  addons: [
    { id: 'single-lid',     label: 'Extra Single Lid' },
    { id: 'travel-scooper', label: 'Travel Scooper' },
  ],
}

// Price/image for each ADD ONS chip — same id, full list price, and image
// as that product's own page (single-lid.html / travel-scooper.html), so
// adding one here is indistinguishable from buying it there. Intentionally
// the *paid* ids (not '-free'), so an add-on purchase never merges with
// the free lid/scooper perk PilrCart grants automatically elsewhere.
const ADD_ONS = {
  'single-lid':     { label: 'Single Lid',     price: 7, image: 'images/lifestyle_section/Full Render.png', maxQty: 5 },
  'travel-scooper': { label: 'Travel Scooper', price: 11, image: 'images/lifestyle_section/Scooper.png' },
}

// ── Individual pod GLB paths ─────────────────────────────────
// Large Pill/Powder extracted from stack-bottle.glb (the homepage hero
// model's four named parts — see extract-pods.mjs) since that model's
// geometry looks noticeably better than the original Configurations
// set. Each export has the rotation + 1000x scale correction already
// baked in, so it drops into the exact same transform chain below
// unmodified. Small Pill Pod stays on the original Configurations asset —
// stack-bottle.glb's Small Pill Pod reflects an older product design that
// still has a dispenser-flap cutout, which the real product no
// longer has.
const POD_GLBS = {
  'Small Pill Pod':   './models/Configurations/pill_module_260520.glb',
  'Large Pill Pod': './models/Configurations/Hybrid%20Pod%20New.glb',
  'Powder Pod': './models/Configurations/Powder%20Pod%20New.glb',
}

// The lid that caps whatever pod ends up on top of the stack — always the
// same asset regardless of which pod it's resting on.
const LID_GLB = './models/Configurations/Multi-Pod%20Lid%20New.glb'

// ── Pricing ────────────────────────────────────────────────────
// Same base prices and tiered quantity discount curve as the "Add a
// Pod" widget on the single-pod product pages (pill-pod.html etc.) —
// kept in sync manually since there's no shared pricing config in the
// codebase yet; see pill-pod.html for the source of truth.
const POD_BASE_PRICE  = { 'Small Pill Pod': 24, 'Large Pill Pod': 28, 'Powder Pod': 32 }
const POD_CART_ID     = { 'Small Pill Pod': 'pill-pod', 'Large Pill Pod': 'hybrid-pod', 'Powder Pod': 'powder-pod' }
const DISCOUNT_BY_QTY = [0, 0, 0.10, 0.15, 0.20, 0.25, 0.28] // index = total pods, 6+ capped at index 6
function discountForQty(qty) { return DISCOUNT_BY_QTY[Math.min(qty, 6)] }
function formatPrice(n) { return '$' + (Number.isInteger(n) ? n : n.toFixed(2)) }

// Exactly one Small Pill + one Large Pill + one Powder Pod is its own bundle (the
// same product classic-stack.html sells), priced below the generic
// tiered discount — not derived from DISCOUNT_BY_QTY. The instant the
// selection becomes anything else (a 4th pod, a duplicate, one type
// missing), this stops applying and the normal per-pod pricing takes
// over again.
const CLASSIC_STACK = {
  id: 'classic-stack', title: 'Classic Stack', price: 68,
  image: 'images/lifestyle_section/Hand Render.png',
}
const CLASSIC_STACK_LIST_PRICE = POD_BASE_PRICE['Small Pill Pod'] + POD_BASE_PRICE['Large Pill Pod'] + POD_BASE_PRICE['Powder Pod']

const POD_INFO = {
  'Small Pill Pod': {
    desc: 'Built for the small capsules you take every day. Three compartments, a full week, one pod.',
    specs: ['[Size] mL'],
    examples: 'Vitamin D, Zinc, Multivitamins, etc.',
  },
  'Large Pill Pod': {
    desc: 'Built to carry a week\'s supply of medium and large capsules.',
    specs: ['[Size] mL'],
    examples: 'Fish Oil, Magnesium, Ashwagandha, etc.',
  },
  'Powder Pod': {
    desc: 'Stores your daily powders.',
    specs: ['[Size] mL'],
    examples: 'Creatine, Pre-Workout, Greens Powder',
  },
}

const DROP_OFFSET = 1.5   // scaled for individual pod GLB units
const FLY_OFFSET  = 2.0

// ── Selection state ──────────────────────────────────────────
const selected = { powders: new Set(), hybrid: new Set(), pills: new Set(), addons: new Set() }
let currentPodTypes = []
// Latest pod counts/total — read by the "Add to Cart" click handler so
// it doesn't need to recompute calcPods() itself.
let currentPodCounts   = { pillPods: 0, hybridPods: 0, powderPods: 0 }
let currentAddonIds      = []   // selected ADD_ONS ids, same reasoning as currentPodCounts above
// How many of each selected add-on. Only add-ons with a maxQty (the Single
// Lid) can go above 1. openAddonRows remembers which add-on summary rows are
// expanded, since the summary is rebuilt on every change.
const addonQty = {}
const openAddonRows = new Set()
const qtyOf = id => addonQty[id] ?? 1
const addonQtyTotal = () => [...selected.addons].reduce((n, id) => n + qtyOf(id), 0)
function removeAddon(id) {
  selected.addons.delete(id)
  delete addonQty[id]
  openAddonRows.delete(id)
  document.querySelector(`.supp-chip[data-id="${id}"]`)?.classList.remove('selected')
}
let currentCartTotal     = 0
let currentCartListTotal = 0   // sum of the struck-through list prices, for the Add to Cart button
let isClassicStackCart = false
let lastPodKey      = ''
let buildSeq        = 0   // incremented on each buildStack call; stale builds abort on completion

// ── Renderer ─────────────────────────────────────────────────
const canvasEl = document.getElementById('system-canvas')
const wrap     = canvasEl.parentElement
const isMobile = window.innerWidth < 768

function cSize() { return { w: wrap.clientWidth, h: wrap.clientHeight } }
let { w: CW, h: CH } = cSize()

const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.toneMapping         = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
renderer.shadowMap.enabled   = !isMobile
renderer.shadowMap.type      = THREE.PCFSoftShadowMap
renderer.setSize(CW, CH)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xFAFAF8)

// ── Camera ───────────────────────────────────────────────────
const CAMERA_REST_POS    = new THREE.Vector3(0, 0.4, 6.1)
const CAMERA_REST_TARGET = new THREE.Vector3(0, 0, 0)

// Returns the ideal camera Z so the full stack fits in the viewport.
// ZOOM pulls the camera uniformly closer (same ratio at every pod count,
// so taller stacks still back off exactly as before relative to shorter
// ones — only the baseline distance changes) to make the pods read a
// bit bigger / more foreground, without touching how they're spaced.
// Eased back from 0.88 toward 1 (further from the pods = smaller on
// screen) after the three-column layout narrowed the canvas and made
// that same zoom level read as too large.
// On phones the canvas is 46vh tall (CSS, builder.css). The camera's vertical
// field of view is fixed, so a taller canvas would enlarge the pods; backing
// the camera off by the same ratio keeps them the size they were at 38vh.
const CANVAS_SCALE = isMobile ? 46 / 38 : 1
const ZOOM = 1.06 * CANVAS_SCALE
function idealCameraZ(podCount) {
  if (podCount <= 1) return 4.7 * ZOOM
  if (podCount === 2) return 5.0 * ZOOM
  return (4.7 + (podCount - 1) * 0.72) * ZOOM   // 3→6.1, 4→6.8, 5→7.6 (pre-zoom)
}

const camera = new THREE.PerspectiveCamera(40, CW / CH, 0.1, 50)
camera.position.copy(CAMERA_REST_POS)
const cameraTarget = CAMERA_REST_TARGET.clone()

// ── Lights ───────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.35))

const key = new THREE.DirectionalLight(0xffffff, 4.5)
key.position.set(5, 8, 6)
// The key light lights the pods but no longer casts the floor shadow: from
// its angle (up and to the right) the tilted stack's shadow landed far to
// the lower left, detached from the stack. A second, shadow-only light
// (intensity 0, so it adds no brightness) sits almost overhead instead, so
// the shadow falls just under the stack.
key.castShadow = false
scene.add(key)

const shadowLight = new THREE.DirectionalLight(0xffffff, 0)
shadowLight.position.set(1.2, 9, 2.5)
shadowLight.castShadow = !isMobile
shadowLight.shadow.mapSize.set(1024, 1024)
shadowLight.shadow.bias = -0.001
scene.add(shadowLight)

const fill = new THREE.DirectionalLight(0xd0eeff, 1.8)
fill.position.set(-5, 2, 4)
scene.add(fill)

const rim = new THREE.PointLight(0x8BB8C8, 7, 14)
rim.position.set(-3, 2, -4)
scene.add(rim)

const accentLow = new THREE.PointLight(0x607090, 3, 10)
accentLow.position.set(3, -4, 3)
scene.add(accentLow)

const topSpot = new THREE.PointLight(0xffffff, 8, 8)
topSpot.position.set(0.5, 6, 2)
scene.add(topSpot)

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 64),
  new THREE.ShadowMaterial({ opacity: 0.55 })
)
floor.rotation.x = -Math.PI / 2
floor.position.y = -2.4
floor.receiveShadow = true
scene.add(floor)

// ── Outer group ──────────────────────────────────────────────
const OUTER_REST_ROT_Z = THREE.MathUtils.degToRad(15)
const OUTER_REST_ROT_X = THREE.MathUtils.degToRad(-8)
const OUTER_REST_POS_Y = isMobile ? -0.2 : -0.15

// Where the stack rests vertically. Normally OUTER_REST_POS_Y; shifts up a
// little when the extra lid is lying below the stack (see applyFraming).
let restPosY = OUTER_REST_POS_Y

const outerGroup = new THREE.Group()
outerGroup.rotation.z = OUTER_REST_ROT_Z
outerGroup.rotation.x = OUTER_REST_ROT_X
outerGroup.position.y = OUTER_REST_POS_Y
scene.add(outerGroup)

// Holds the extra lid. Same scale and orientation as the stack's own group,
// so a lid placed here lines up with the stack (and shares its tilt/spin
// through outerGroup).
const lidHolder = new THREE.Group()
lidHolder.scale.setScalar(isMobile ? 18.5 : 16.5)
lidHolder.rotation.x = THREE.MathUtils.degToRad(90)
outerGroup.add(lidHolder)

// ── Model state ──────────────────────────────────────────────
let sections        = []
let modelLoaded     = false
let currentGlbScene = null
// The lid sitting on top of the stack — tracked separately from `sections`
// (not clickable, no label, no "View inside" panel of its own) but still
// animated alongside them for drop-in and detail-view fly-away.
let lidSection       = null
// The paid "Extra Single Lid" add-on: a second lid. It lives in its own
// group (lidHolder, below), not in the stack, so it survives pod changes: it
// sits centered on its own when there are no pods, and glides to a spot
// below the stack when there are. `extraLid` is the live mesh
// ({ mesh, restZ }); `stackBottomY` is the stack's lowest point (null when
// there are no pods).
let extraLid         = null
let stackBottomY     = null
let stackTopY        = null
let stackRadius      = 0.7
let extraLidLabelEl  = null
let extraLidAdding   = false
const EXTRA_LID_GAP  = 0.62   // world units between the underside of the bottom pod and the top of the lid
const EXTRA_LID_RISE = 0.14   // how far below its spot the lid starts when it rises in
// With no pods the lid sits mid-canvas, level with the camera, so it's tilted
// back toward the viewer to show its top face, and that tilt is held fixed
// relative to the viewer (it doesn't turn with the stack's slow spin, which
// would show the lid's underside half the time). Under a stack it just follows
// the stack. lidAloneBlend is 0 when following the stack, 1 when held fixed;
// it's tweened when pods come and go.
const LID_ALONE_TILT = THREE.MathUtils.degToRad(35)
// Under a stack the lid is also held facing the viewer, turned up more steeply
// so its face reads clearly instead of lying edge-on below the pods.
const LID_BELOW_TILT = THREE.MathUtils.degToRad(65)
const lidTilt        = { v: LID_ALONE_TILT }   // current tilt, tweened between the two
const lidAloneBlend  = { v: 1 }
// Where the extra lid goes when there are pods:
//   'back'  - a smaller lid floating behind the stack, peeking out to its right
//   'below' - a full-size lid turned up under the stack (older layout, kept)
// With no pods the lid is always centered at full size.
const EXTRA_LID_PLACEMENT = 'back'
const backMode = () => EXTRA_LID_PLACEMENT === 'back'
const LID_BACK_TILT     = THREE.MathUtils.degToRad(0)    // 0 = lying flat; 90 = standing up, face straight toward the viewer
// The lid is anchored to a spot on the SCREEN (not the 3D scene), so it stays in
// the canvas's bottom-left corner however the camera moves. Sizes are fractions
// of the canvas height; the main pods back off a little to leave it room.
const LID_CORNER_NX     = -0.64                       // horizontal screen spot (-1 = left edge, 1 = right edge)
const LID_CORNER_NY     = -0.58                       // vertical screen spot (-1 = bottom edge)
const LID_CORNER_SIZE   = isMobile ? 0.24 : 0.28                        // lid diameter on screen (fraction of canvas height)
const LID_ALONE_SIZE    = 0.30                        // ...when it's the only thing on screen
const LID_CORNER_PULLBACK = 1.10                      // camera distance multiplier with the lid out (1 = pods at full size; 1.10 = about 9% smaller)
const LID_DIAMETER_UNITS = 1.45                       // the lid's width in scene units at scale 1
const lidPose = { nx: 0, ny: 0, d: LID_ALONE_SIZE, g: 1 }   // screen spot, size, and grow-in (0 -> 1)
const HOLDER_BASE_SCALE = isMobile ? 18.5 : 16.5
const lidHolderY     = { v: 0 }   // vertical offset of the lid (stack-axis units), tweened as pods come and go
// Master switch for the 3D "extra lid" render. Off: picking the Extra Single Lid
// chip only adds it to the summary and cart; the canvas shows just the pods.
// Everything else about the lid (placement, tilt, label, framing) is kept below
// and comes back by setting this to true.
const SHOW_EXTRA_LID_RENDER = true
const LID_HEAD_START = 0.3   // seconds the lid gets to move before new pods start dropping
// With the extra lid out, the stack + lid sit lower than the plain centered fit by this
// many screen pixels measured at the middle of the canvas (a bit less at the top edge,
// since the top of the stack is seen in perspective). Raised from 12 when the lid was
// turned up to face the viewer, because the taller lid pulls the pair upward,
// using spare room at the bottom of the canvas.
const LID_FRAMING_SHIFT_PX = 28
// Measured pod height per type, keyed by pod name — populated the first
// time each type loads (see buildStack). Lets the stacking gap stay
// constant across different selections instead of depending on which
// pod type happens to be shortest in the *current* selection.
const HEIGHT_CACHE  = {}

// ── Label state ──────────────────────────────────────────────
let labelEls     = []
let labelAnchors = []

// ── Interaction state ────────────────────────────────────────
let idleActive    = true
let inDetailView  = false
let transitioning = false

// ── GLB loader ───────────────────────────────────────────────
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')
const loader = new GLTFLoader()
loader.setDRACOLoader(dracoLoader)

function loadPod(url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject))
}

// ── Dedicated measurement rig ────────────────────────────────
// A private, never-rendered copy of outerGroup/stackGroup's rest
// transform chain, used only to measure each pod's bounding box.
// Measuring against the LIVE outerGroup/stackGroup (like this used to)
// ties the result to whatever those groups' current state happens to
// be: (1) outerGroup's own tilt is intentional and reproduced here, but
// once idle rotation starts running between builds its rotation.y
// drifts, so the exact same pod could measure slightly differently
// depending on when it's measured; (2) when a build gets superseded
// mid-flight, a later call's cleanup detaches *its* stackGroup from
// outerGroup, so outerGroup.updateMatrixWorld() silently no-ops for
// that now-orphaned subtree and the pod's rotation never reaches
// matrixWorld — corrupting the measurement (it ends up reading an
// unrotated cross-section instead of the true height). This rig is
// never attached to the live scene and nothing else ever touches it,
// so neither problem can happen here.
const measureOuter = new THREE.Group()
measureOuter.rotation.z = OUTER_REST_ROT_Z
measureOuter.rotation.x = OUTER_REST_ROT_X
const measureStack = new THREE.Group()
measureStack.scale.setScalar(isMobile ? 18.5 : 16.5)
measureStack.rotation.x = THREE.MathUtils.degToRad(90)
measureOuter.add(measureStack)
measureOuter.updateMatrixWorld(true)
const measureInvMat = new THREE.Matrix4().copy(measureStack.matrixWorld).invert()

// Rotates a pod -90° around X (so its height axis lands on stackGroup's
// -Z, which after stackGroup's own rotation.x=90 maps to world +Y) and
// centers it at x=0, y=0, measuring entirely within the private rig
// above. Mutates `s` in place (rotation + centering) and returns its
// resulting local zMin/zMax — safe to call for any pod, raced build or
// not, since nothing else can run between these synchronous steps.
function measurePod(s) {
  measureStack.add(s)
  s.rotation.x = THREE.MathUtils.degToRad(-90)
  measureOuter.updateMatrixWorld(true)
  const worldBox = new THREE.Box3().setFromObject(s)
  const localBox = worldBox.clone().applyMatrix4(measureInvMat)

  s.position.x -= (localBox.min.x + localBox.max.x) / 2
  s.position.y -= (localBox.min.y + localBox.max.y) / 2
  measureOuter.updateMatrixWorld(true)
  const wb2 = new THREE.Box3().setFromObject(s)
  const lb2 = wb2.clone().applyMatrix4(measureInvMat)

  measureStack.remove(s)
  return { zMin: Math.min(lb2.min.z, lb2.max.z), zMax: Math.max(lb2.min.z, lb2.max.z) }
}

// OVERLAP below is derived from the *shortest* pod type's height, so it
// stays a true session constant only once every type has been measured
// at least once. The default stack's own build normally fills this in
// within well under a second of page load, but a selection whose build
// finishes first — e.g. one that skips Small Pill Pod, whose Draco-compressed
// GLB decodes slower than the others — would otherwise compute OVERLAP
// from an incomplete (and so inflated) minimum for that one build. This
// tops up whatever's missing before OVERLAP gets computed.
async function ensureAllHeights() {
  const missing = Object.keys(POD_GLBS).filter(t => !(t in HEIGHT_CACHE))
  if (!missing.length) return
  const gltfs = await Promise.all(missing.map(t => loadPod(POD_GLBS[t])))
  gltfs.forEach((gltf, i) => {
    const type = missing[i]
    if (type in HEIGHT_CACHE) return   // filled in by someone else while we were loading
    const { zMin, zMax } = measurePod(gltf.scene)
    HEIGHT_CACHE[type] = Math.abs(zMax - zMin)
  })
}

// ── Build stack from individual pod GLBs ─────────────────────
async function buildStack(podTypes, onReady) {
  const mySeq = ++buildSeq   // claim this build slot; any prior in-flight build is now stale

  if (inDetailView) exitDetailView()

  if (currentGlbScene) {
    outerGroup.remove(currentGlbScene)
    currentGlbScene = null
  }
  sections        = []
  lidSection      = null
  stackBottomY    = null
  stackTopY       = null
  modelLoaded     = false
  currentPodTypes = [...podTypes]

  if (!podTypes.length) {
    modelLoaded = true
    initLabels([])
    if (onReady) onReady()
    return
  }

  document.getElementById('system-loading')?.classList.remove('hidden')

  try {
    const stackGroup = new THREE.Group()
    stackGroup.scale.setScalar(isMobile ? 18.5 : 16.5)
    stackGroup.rotation.x = THREE.MathUtils.degToRad(90)
    currentGlbScene = stackGroup
    outerGroup.add(stackGroup)

    const darkMat = new THREE.MeshStandardMaterial({
      color:     0x111111,
      roughness: 0.75,
      metalness: 0.0,
    })

    // Load all pods in parallel. The new Large Pill Pod GLB (extracted from
    // stack-bottle.glb) already has its own internal divider wall
    // modeled in, unlike the old Configurations Large Pill Pod which was an
    // empty shell needing a separate divider_2026_0520.glb piece added
    // on top — doing that here now would overlay a second, perpendicular
    // wall and make the pod look like it has 4 compartments instead of 2.
    const [podGltfs, lidGltf] = await Promise.all([
      Promise.all(podTypes.map(t => loadPod(POD_GLBS[t]))),
      loadPod(LID_GLB),
      ensureAllHeights(),
    ])

    const podData = podGltfs.map((gltf, i) => {
      const s = gltf.scene
      s.traverse(m => {
        if (m.isMesh) {
          m.castShadow = true
          m.material   = darkMat
        }
      })

      // Rotates -90° and centers x/y, measured via the private rig above —
      // see measurePod for why that matters. Leaves s's rotation/position
      // set correctly for when it gets added to the real stackGroup below.
      const { zMin, zMax } = measurePod(s)
      stackGroup.add(s)

      const height = Math.abs(zMax - zMin)
      // Cache every pod type's measured height the first time we see it.
      // The default stack (Small Pill + Large Pill + Powder) loads on page load,
      // before any selection is possible, so by the time the user picks
      // anything this cache already holds all three — see HEIGHT_CACHE
      // below for why that matters.
      if (!(podTypes[i] in HEIGHT_CACHE)) HEIGHT_CACHE[podTypes[i]] = height

      return { scene: s, zMin, zMax }
    })

    // A newer buildStack call started while we were loading — discard this
    // result. Checked *after* HEIGHT_CACHE is populated above (not before
    // the loads) so a build that gets superseded mid-flight — e.g. the
    // very first page-load call, if the user clicks a chip before its GLBs
    // finish — still records whatever pod heights it measured instead of
    // silently dropping them. Previously Small Pill Pod could end up permanently
    // missing from HEIGHT_CACHE for the rest of the session whenever that
    // happened, skewing the stacking math for any selection that didn't
    // happen to include a Small Pill Pod.
    if (mySeq !== buildSeq) {
      document.getElementById('system-loading')?.classList.add('hidden')
      return
    }

    // Per-type center fraction: Small Pill Pod geometry sits toward the top of its BB
    // so we bias the center upward to close the gap it creates below
    const CENTER_BIAS = { 'Small Pill Pod': 0.72, 'Large Pill Pod': 0.5, 'Powder Pod': 0.5 }

    // Half-extent of each pod above/below its own bias-weighted center.
    // The pods physically nest into each other (each one's connector slides
    // into the next), so neighboring bounding boxes are *meant* to overlap
    // along the stack axis — what needs to stay constant is that overlap
    // depth, not the raw center-to-center distance. A flat center-to-center
    // step (the old approach) only gives a constant overlap when neighboring
    // pods share the same height/bias — it silently broke the moment two
    // Small Pill Pods ended up adjacent (bias=0.72 leaves Small Pill Pod a tiny
    // 0.28-of-height half-span above its own center), so that pair nested
    // only half as deep as every other pod-to-pod boundary and visibly
    // read as a gap where the others looked fused.
    const halfExtents = podData.map((d, i) => {
      const bias     = CENTER_BIAS[podTypes[i]] ?? 0.5
      const bbCenter = d.zMin + (d.zMax - d.zMin) * bias
      return { above: bbCenter - d.zMin, below: d.zMax - bbCenter, bbCenter }
    })

    // HEIGHT_CACHE remembers every pod type's height across the whole
    // session (not just the current selection) so this stays a session
    // constant regardless of what's currently selected — matching the
    // nesting depth the default Classic Stack shows on first load.
    const OVERLAP = Math.min(...Object.values(HEIGHT_CACHE)) * 0.63

    // Sum of the fixed half-extents at every boundary — the total stack
    // height is this minus (n-1) * whatever overlap depth we end up using.
    let sumHalfExtents = 0
    for (let i = 0; i < podData.length - 1; i++) {
      sumHalfExtents += halfExtents[i].above + halfExtents[i + 1].below
    }

    // Cap total stack height so unusually large selections (many
    // duplicate pods) still fit the canvas instead of overflowing it —
    // nest them deeper (more overlap) rather than shrinking the pods.
    const MAX_HEIGHT = 0.26
    const overlapUsed = podData.length > 1
      ? Math.max(OVERLAP, (sumHalfExtents - MAX_HEIGHT) / (podData.length - 1))
      : OVERLAP

    const totalHeight = sumHalfExtents - overlapUsed * (podData.length - 1)
    let stackZ = totalHeight / 2

    for (let i = 0; i < podData.length; i++) {
      const { scene: s } = podData[i]
      s.position.z = stackZ - halfExtents[i].bbCenter
      outerGroup.updateMatrixWorld(true)

      sections.push({ mesh: s, restZ: s.position.z })
      if (i < podData.length - 1) {
        stackZ -= (halfExtents[i].above + halfExtents[i + 1].below) - overlapUsed
      }
    }

    // ── Lid: always caps whatever pod ends up on top. Continues the exact
    // same stepping pattern used between every pair of pods above (same
    // `overlapUsed` nesting depth), so it reads as just another pod in the
    // stack rather than a separately-tuned gap.
    const lidScene = lidGltf.scene
    lidScene.traverse(m => {
      if (m.isMesh) {
        m.castShadow = true
        m.material   = darkMat
      }
    })
    const { zMin: lidZMin, zMax: lidZMax } = measurePod(lidScene)
    stackGroup.add(lidScene)

    const lidBBCenter    = lidZMin + (lidZMax - lidZMin) * 0.5
    const lidHalfExtents = { above: lidBBCenter - lidZMin, below: lidZMax - lidBBCenter }
    const topHalfExtents = halfExtents[halfExtents.length - 1]

    stackZ -= (topHalfExtents.above + lidHalfExtents.below) - overlapUsed
    lidScene.position.z = stackZ - lidBBCenter
    outerGroup.updateMatrixWorld(true)

    lidSection = { mesh: lidScene, restZ: lidScene.position.z }

    // Where the stack's real lowest point is (measured from the actual
    // geometry, since a pod's bounding box can have empty space below it) —
    // the extra lid is placed relative to this.
    const podsBox = preciseBox(sections.map(s => s.mesh))
    stackBottomY  = podsBox.min.y
    stackTopY     = podsBox.max.y
    stackRadius   = Math.max(0.3, (podsBox.max.x - podsBox.min.x) / 2)

    modelLoaded = true
    document.getElementById('system-loading')?.classList.add('hidden')

    const labelNames = getLabelNamesForPods(podTypes)
    initLabels(labelNames)
    computeLabelAnchors()
    if (onReady) onReady()
  } catch (err) {
    console.error('[System Builder] buildStack error:', err)
    document.getElementById('system-loading')?.classList.add('hidden')
    modelLoaded = true
  }
}

// ── Label system ─────────────────────────────────────────────
function initLabels(podNames) {
  const container = document.getElementById('system-labels')
  if (!container) return
  container.innerHTML = ''
  labelEls = []

  podNames.forEach((name, i) => {
    const side = i % 2 === 0 ? 'right' : 'left'
    const el   = document.createElement('div')
    el.className = `blabel blabel-${side}`
    el.innerHTML = `
      <div class="blabel-dot"></div>
      <div class="blabel-line"></div>
      <div class="blabel-text">
        <span class="blabel-name">${name}</span>
        <button class="blabel-explore">View inside</button>
      </div>
    `
    el.querySelector('.blabel-explore').addEventListener('click', (e) => {
      e.stopPropagation()
      enterDetailView(i)
    })
    container.appendChild(el)
    labelEls.push(el)
  })
}

function computeLabelAnchors() {
  if (!sections.length) return
  const rx = outerGroup.rotation.x, ry = outerGroup.rotation.y
  const rz = outerGroup.rotation.z, py = outerGroup.position.y

  outerGroup.rotation.set(0, 0, 0)
  outerGroup.position.y = 0
  outerGroup.updateMatrixWorld(true)

  labelAnchors = sections.map(s => {
    const box = new THREE.Box3()
    s.mesh.traverse(child => { if (child.isMesh) box.expandByObject(child) })
    const center = new THREE.Vector3()
    box.getCenter(center)
    return outerGroup.worldToLocal(center)
  })

  outerGroup.rotation.x = rx; outerGroup.rotation.y = ry
  outerGroup.rotation.z = rz; outerGroup.position.y = py
  outerGroup.updateMatrixWorld(true)
}

function updateLabels() {
  if (!labelEls.length || !labelAnchors.length) return
  // With the lid in the bottom-left corner, keep every pod label on the right
  // so none of them runs into it.
  const forceRight = backMode() && !!extraLid && currentPodTypes.length > 0
  labelEls.forEach((el, i) => {
    const want = forceRight ? 'right' : (i % 2 === 0 ? 'right' : 'left')
    if (!el.classList.contains('blabel-' + want)) {
      el.classList.remove('blabel-left', 'blabel-right')
      el.classList.add('blabel-' + want)
    }
  })
  const rect   = canvasEl.getBoundingClientRect()
  const hidden = inDetailView || transitioning

  // First pass: compute raw projected positions
  const info = labelEls.map((el, i) => {
    if (hidden) { el.classList.remove('visible'); return { el, visible: false } }
    const anchor = labelAnchors[i]
    if (!anchor) return { el, visible: false }

    const worldPos = anchor.clone()
    outerGroup.localToWorld(worldPos)
    const ndc = worldPos.clone().project(camera)

    if (ndc.z > 1) return { el, visible: false }

    const edgeOffset = (rect.height / camera.position.z) * 0.95
    const isRight    = el.classList.contains('blabel-right')
    const xPx        = (ndc.x * 0.5 + 0.5) * rect.width + (isRight ? edgeOffset : -edgeOffset)
    const yPx        = (ndc.y * -0.5 + 0.5) * rect.height

    return { el, visible: true, xPx, yPx, isRight }
  })

  // Second pass: push apart labels on the same side that are too close,
  // then clamp to canvas bounds so collision resolution never hides a label.
  const MIN_GAP    = 50   // px between label centers
  const LABEL_HALF = 24   // half the label's visual height (approx)
  ;['right', 'left'].forEach(side => {
    const group = info.filter(d => d.visible && d.isRight === (side === 'right'))
    group.sort((a, b) => a.yPx - b.yPx)
    for (let pass = 0; pass < 4; pass++) {
      for (let j = 1; j < group.length; j++) {
        const gap = group[j].yPx - group[j - 1].yPx
        if (gap < MIN_GAP) {
          const shift = (MIN_GAP - gap) / 2
          group[j - 1].yPx -= shift
          group[j].yPx     += shift
        }
      }
    }
    // Clamp so no label goes off the top or bottom of the canvas
    group.forEach(d => {
      d.yPx = Math.max(LABEL_HALF, Math.min(rect.height - LABEL_HALF, d.yPx))
    })
  })

  // Apply final positions
  info.forEach(d => {
    if (!d.visible) { d.el.classList.remove('visible'); return }
    d.el.style.left = d.xPx + 'px'
    d.el.style.top  = d.yPx + 'px'
    d.el.classList.add('visible')
  })
}

// ── Drop animation ───────────────────────────────────────────
function playDrop(startDelay = 0) {
  // Lid drops in last, continuing the same cascade right after the top pod.
  const all = lidSection ? [...sections, lidSection] : sections
  if (!all.length) return
  all.forEach(s => gsap.killTweensOf(s.mesh.position))
  all.forEach(s => { s.mesh.position.z = s.restZ - DROP_OFFSET })

  const tl = gsap.timeline()
  all.forEach((s, i) => {
    tl.to(s.mesh.position, { z: s.restZ, duration: 0.72, ease: 'power3.out' }, startDelay + i * 0.18)
  })
}

// ── Pod detail view ──────────────────────────────────────────
function getSectionDetailSetup(sectionIndex) {
  const rx = outerGroup.rotation.x, ry = outerGroup.rotation.y
  const rz = outerGroup.rotation.z, py = outerGroup.position.y

  outerGroup.rotation.set(0, 0, 0)
  outerGroup.position.y = 0
  outerGroup.updateMatrixWorld(true)

  const box = new THREE.Box3()
  sections[sectionIndex].mesh.traverse(child => { if (child.isMesh) box.expandByObject(child) })

  const center   = new THREE.Vector3()
  const size     = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)

  const halfSpan = Math.max(size.x, size.z) / 2
  const height   = Math.max((halfSpan / Math.tan(THREE.MathUtils.degToRad(20))) * 1.4, 3.5)
  const camPos   = new THREE.Vector3(center.x - 0.55, center.y + height, center.z + 0.05)

  outerGroup.rotation.x = rx; outerGroup.rotation.y = ry
  outerGroup.rotation.z = rz; outerGroup.position.y = py
  outerGroup.updateMatrixWorld(true)

  return { center, camPos }
}

function enterDetailView(sectionIndex) {
  if (inDetailView || transitioning || !modelLoaded) return
  transitioning = true
  idleActive    = false

  gsap.to(outerGroup.rotation, { y: 0, duration: 0.4, ease: 'power2.out' })

  sections.forEach((s, i) => {
    if (i === sectionIndex) return
    const dir = i < sectionIndex ? FLY_OFFSET : -FLY_OFFSET
    gsap.to(s.mesh.position, { z: s.restZ + dir, duration: 0.55, ease: 'power2.in', delay: 0.05 })
  })
  // The lid sits above every pod, so it always flies off the same way the
  // other above-the-clicked-pod sections do — regardless of which pod was
  // clicked, including the top one it's actually resting on.
  if (lidSection) {
    gsap.to(lidSection.mesh.position, { z: lidSection.restZ - FLY_OFFSET, duration: 0.55, ease: 'power2.in', delay: 0.05 })
  }
  // The extra lid lies below the stack, so it flies off downward.
  if (extraLid) {
    gsap.to(extraLid.mesh.position, { z: extraLid.restZ + FLY_OFFSET, duration: 0.55, ease: 'power2.in', delay: 0.05 })
  }

  gsap.to(outerGroup.rotation, { x: 0, z: 0, duration: 0.85, ease: 'power2.inOut' })
  gsap.to(outerGroup.position, { y: 0, duration: 0.85, ease: 'power2.inOut' })

  const { center: podCenter, camPos: detailCamPos } = getSectionDetailSetup(sectionIndex)

  gsap.to(camera.position, {
    x: detailCamPos.x, y: detailCamPos.y, z: detailCamPos.z,
    duration: 1.05, ease: 'power2.inOut',
  })
  gsap.to(cameraTarget, {
    x: podCenter.x, y: podCenter.y, z: podCenter.z,
    duration: 1.05, ease: 'power2.inOut',
    onComplete: () => { transitioning = false; inDetailView = true },
  })

  document.getElementById('system-back-btn')?.classList.add('visible')
  document.getElementById('system-selector')?.classList.add('hidden')
  document.querySelector('.system-layout')?.classList.add('detail-active')

  showPodPanel(currentPodTypes[sectionIndex] ?? '')
}

function exitDetailView() {
  if (!inDetailView || transitioning) return
  transitioning = true
  inDetailView  = false

  document.getElementById('system-back-btn')?.classList.remove('visible')
  document.getElementById('system-selector')?.classList.remove('hidden')
  document.querySelector('.system-layout')?.classList.remove('detail-active')
  hidePodPanel()

  gsap.to(camera.position, {
    x: CAMERA_REST_POS.x, y: CAMERA_REST_POS.y, z: CAMERA_REST_POS.z,
    duration: 1.0, ease: 'power2.inOut',
  })
  gsap.to(cameraTarget, {
    x: CAMERA_REST_TARGET.x, y: CAMERA_REST_TARGET.y, z: CAMERA_REST_TARGET.z,
    duration: 1.0, ease: 'power2.inOut',
    onComplete: () => { idleActive = true; transitioning = false },
  })

  gsap.to(outerGroup.rotation, { x: OUTER_REST_ROT_X, z: OUTER_REST_ROT_Z, duration: 0.9, ease: 'power2.inOut' })
  gsap.to(outerGroup.position, { y: restPosY, duration: 0.9, ease: 'power2.inOut' })

  sections.forEach((s, i) => {
    gsap.to(s.mesh.position, { z: s.restZ, duration: 0.7, ease: 'power3.out', delay: 0.25 + i * 0.08 })
  })
  if (lidSection) {
    gsap.to(lidSection.mesh.position, { z: lidSection.restZ, duration: 0.7, ease: 'power3.out', delay: 0.25 + sections.length * 0.08 })
  }
  if (extraLid) {
    gsap.to(extraLid.mesh.position, { z: extraLid.restZ, duration: 0.7, ease: 'power3.out', delay: 0.25 + (sections.length + 1) * 0.08 })
  }
}

// ── Pod detail panel ─────────────────────────────────────────
function showPodPanel(podName) {
  const info  = POD_INFO[podName]
  const panel = document.getElementById('pod-detail-panel')
  if (!panel) return

  document.getElementById('pod-detail-name').textContent      = podName
  document.getElementById('pod-detail-desc').textContent      = info?.desc ?? ''
  document.getElementById('pod-detail-specs').innerHTML       = (info?.specs ?? []).map(s => `<li>${s}</li>`).join('')
  document.getElementById('pod-detail-examples').textContent  = info?.examples ?? ''
  panel.classList.add('visible')
}

function hidePodPanel() {
  document.getElementById('pod-detail-panel')?.classList.remove('visible')
}

// ── Raycaster ────────────────────────────────────────────────
const raycaster = new THREE.Raycaster()
const mouse     = new THREE.Vector2()

function getClickableMeshes() {
  const result = []
  sections.forEach((s, i) => {
    s.mesh.traverse(m => { if (m.isMesh) result.push({ mesh: m, index: i }) })
  })
  return result
}

canvasEl.addEventListener('click', (e) => {
  if (inDetailView || transitioning || !modelLoaded) return
  const rect = canvasEl.getBoundingClientRect()
  mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const candidates = getClickableMeshes()
  const hits = raycaster.intersectObjects(candidates.map(c => c.mesh))
  if (hits.length) {
    const found = candidates.find(c => c.mesh === hits[0].object)
    if (found) enterDetailView(found.index)
  }
})

canvasEl.addEventListener('mousemove', (e) => {
  if (inDetailView || transitioning || !modelLoaded) { canvasEl.style.cursor = 'default'; return }
  const rect = canvasEl.getBoundingClientRect()
  mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const candidates = getClickableMeshes()
  canvasEl.style.cursor = raycaster.intersectObjects(candidates.map(c => c.mesh)).length ? 'pointer' : 'default'
})

canvasEl.addEventListener('touchend', (e) => {
  if (inDetailView || transitioning || !modelLoaded) return
  const touch = e.changedTouches[0]
  const rect  = canvasEl.getBoundingClientRect()
  mouse.x =  ((touch.clientX - rect.left) / rect.width)  * 2 - 1
  mouse.y = -((touch.clientY - rect.top)  / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const candidates = getClickableMeshes()
  const hits = raycaster.intersectObjects(candidates.map(c => c.mesh))
  if (hits.length) {
    const found = candidates.find(c => c.mesh === hits[0].object)
    if (found) enterDetailView(found.index)
  }
}, { passive: true })

document.getElementById('system-back-btn')?.addEventListener('click', exitDetailView)


// ── Extra Single Lid (paid add-on) ───────────────────────────
// A second lid, same model as the one capping the stack. With no pods it
// sits centered on its own; with pods it lies centered below the stack as a
// separate extra. It shares the stack's tilt and slow spin (via outerGroup),
// and adding/removing it never rebuilds the pods.
function ensureExtraLidLabel() {
  if (extraLidLabelEl?.isConnected) return extraLidLabelEl
  const container = document.getElementById('system-labels')
  if (!container) return null
  const el = document.createElement('div')
  el.className = 'blabel blabel-right'
  el.innerHTML = `
    <div class="blabel-dot"></div>
    <div class="blabel-line"></div>
    <div class="blabel-text"><span class="blabel-name">Single Lid</span></div>
  `
  container.appendChild(el)
  extraLidLabelEl = el
  return el
}

// Tight bounding box (from the real vertices, not the loose per-object
// boxes) of some objects, measured with the outer tilt/spin zeroed so it
// lines up with the stack's own axes.
function preciseBox(objects) {
  const rx = outerGroup.rotation.x, ry = outerGroup.rotation.y
  const rz = outerGroup.rotation.z, py = outerGroup.position.y
  outerGroup.rotation.set(0, 0, 0)
  outerGroup.position.y = 0
  outerGroup.updateMatrixWorld(true)
  const box = new THREE.Box3()
  objects.forEach(o => box.union(new THREE.Box3().setFromObject(o, true)))
  outerGroup.rotation.x = rx; outerGroup.rotation.y = ry
  outerGroup.rotation.z = rz; outerGroup.position.y = py
  outerGroup.updateMatrixWorld(true)
  return box
}

// The lid model, loaded once and measured/oriented like the lid on the stack.
let lidTemplate = null
let lidTemplateCenterZ = 0   // where the lid's own center sits along its axis, so it can be centered on its holder
let lidTemplatePromise = null
function getLidTemplate() {
  if (!lidTemplatePromise) {
    lidTemplatePromise = loadPod(LID_GLB).then(gltf => {
      const s = gltf.scene
      const mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.75, metalness: 0.0 })
      // (The corner lid floats on its own, so it doesn't cast a shadow on the floor.)
      s.traverse(m => { if (m.isMesh) { m.castShadow = !backMode(); m.material = mat } })
      const lm = measurePod(s)
      lidTemplateCenterZ = (lm.zMin + lm.zMax) / 2
      lidTemplate = s
      return s
    })
  }
  return lidTemplatePromise
}

// The z (inside lidHolder) the lid should rest at: just below the stack's
// lowest point when there are pods, otherwise centered on the stack's own
// center line. World y is -z * scale inside lidHolder, so moving z up moves
// the lid down.
// 1 = held still, tilted toward the viewer; 0 = turns and leans with the stack.
// In the corner (with pods) the lid turns exactly like the pods do; on its own it
// is held facing the viewer.
function lidAloneTarget() { return (backMode() && stackBottomY !== null) ? 0 : 1 }
function lidTiltTarget() {
  if (stackBottomY === null) return LID_ALONE_TILT
  return backMode() ? LID_BACK_TILT : LID_BELOW_TILT
}
// Where the lid should be (back placement): centered and large when there are
// no pods, otherwise smaller in the canvas's bottom-left corner.
function lidPoseTarget() {
  if (!backMode() || stackBottomY === null) return { nx: 0, ny: 0, d: LID_ALONE_SIZE }
  // Up to 4 pods the lid stays the same size. Beyond that the camera backs off and the
  // pods shrink, so the lid shrinks by the same proportion to keep matching them.
  const n = currentPodTypes.length
  const keepUp = Math.min(1, idealCameraZ(4) / idealCameraZ(Math.max(n, 1)))
  return { nx: LID_CORNER_NX, ny: LID_CORNER_NY, d: LID_CORNER_SIZE * keepUp }
}

// Called every frame: orients the lid holder. Following the stack it is just
// the base orientation (its world orientation is then outerGroup's tilt/spin
// times that). Held fixed, it counter-rotates outerGroup so its world
// orientation is a constant tilt toward the viewer.
const _tgt     = new THREE.Vector3()
const _qFollow = new THREE.Quaternion()
const _qFixed  = new THREE.Quaternion()
const _eul     = new THREE.Euler()
function updateLidHolderOrientation() {
  if (!extraLid) return
  _qFollow.setFromEuler(_eul.set(THREE.MathUtils.degToRad(90), 0, 0))
  _qFixed.copy(outerGroup.quaternion).invert()
    .multiply(new THREE.Quaternion().setFromEuler(_eul.set(THREE.MathUtils.degToRad(90) + lidTilt.v, 0, 0)))
  lidHolder.quaternion.slerpQuaternions(_qFollow, _qFixed, lidAloneBlend.v)
  if (backMode()) {
    // Anchored to a screen spot: find the point on the stack's mid-depth plane (z = 0)
    // that lands there, and size the lid so it covers a set fraction of the canvas.
    const rect = canvasEl.getBoundingClientRect()
    camera.updateMatrixWorld(true)
    _tgt.set(lidPose.nx, lidPose.ny, 0.5).unproject(camera).sub(camera.position).normalize()
    const t = -camera.position.z / _tgt.z
    _tgt.multiplyScalar(t).add(camera.position)               // world point on z = 0
    const dist       = camera.position.z
    const pxPerUnit  = rect.height / (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
    const unitsWide  = (lidPose.d * rect.height) / pxPerUnit
    lidHolder.scale.setScalar(Math.max(0.001, HOLDER_BASE_SCALE * (unitsWide / LID_DIAMETER_UNITS) * lidPose.g))
    outerGroup.updateMatrixWorld(true)
    lidHolder.position.copy(outerGroup.worldToLocal(_tgt))
  } else {
    lidHolder.scale.setScalar(HOLDER_BASE_SCALE)
    lidHolder.position.set(0, lidHolderY.v, 0)
  }
}

// The lid is centered on its holder; the holder is what moves it (see
// lidHolderTargetY). Moving the lid along its own axis only means "down" when it
// lies flat, and it's now turned up toward the viewer.
function extraLidTargetZ() {
  return -lidTemplateCenterZ
}

// Half the lid's height on screen at its final tilt.
function lidHalfHeight(mesh) {
  const savedQ = lidHolder.quaternion.clone()
  const savedP = lidHolder.position.clone()
  lidHolder.position.set(0, 0, 0)
  lidHolder.rotation.set(THREE.MathUtils.degToRad(90) + lidTiltTarget(), 0, 0)
  const box = preciseBox([mesh])
  lidHolder.quaternion.copy(savedQ)
  lidHolder.position.copy(savedP)
  return (box.max.y - box.min.y) / 2
}

// Where the lid's holder sits vertically: at the middle with no pods, otherwise
// so the top of the (turned-up) lid is EXTRA_LID_GAP below the stack.
function lidHolderTargetY(mesh) {
  return stackBottomY === null ? 0 : stackBottomY - EXTRA_LID_GAP - lidHalfHeight(mesh)
}

async function addExtraLid(delay = 0) {
  if (!SHOW_EXTRA_LID_RENDER || extraLid || extraLidAdding) return
  extraLidAdding = true
  const tpl = await getLidTemplate()
  extraLidAdding = false
  // The chip may have been switched off (or the lid added) while loading.
  if (!selected.addons.has('single-lid') || extraLid) return

  const mesh = tpl.clone(true)
  lidHolder.add(mesh)
  lidAloneBlend.v = lidAloneTarget()
  lidTilt.v = lidTiltTarget()
  lidHolderY.v = lidHolderTargetY(mesh)
  const restZ = extraLidTargetZ()
  if (backMode()) {
    // Appears in place (small, behind the stack, or centered if there are no pods)
    // by growing from nothing.
    const t = lidPoseTarget()
    Object.assign(lidPose, { nx: t.nx, ny: t.ny, d: t.d, g: 0 })
    mesh.position.z = restZ
    extraLid = { mesh, restZ }
    updateLidHolderOrientation()
    gsap.to(lidPose, { g: 1, duration: 0.6, ease: 'back.out(1.6)', delay })
  } else {
    updateLidHolderOrientation()
    mesh.position.z = restZ + EXTRA_LID_RISE
    extraLid = { mesh, restZ }
    gsap.to(mesh.position, { z: restZ, duration: 0.7, ease: 'power3.out', delay })
  }
  applyFraming()
}

// Pods were added/removed: glide the lid to its new spot (below the new
// stack, or back to the center if the stack is gone).
function moveExtraLid(delay = 0) {
  if (!extraLid) return
  extraLid.restZ = extraLidTargetZ()
  if (inDetailView || transitioning) return
  gsap.killTweensOf(extraLid.mesh.position)
  gsap.to(extraLid.mesh.position, { z: extraLid.restZ, duration: 0.7, ease: 'power3.out', delay })
  gsap.killTweensOf(lidTilt)
  gsap.to(lidTilt, { v: lidTiltTarget(), duration: 0.7, ease: 'power3.out', delay })
  gsap.killTweensOf(lidAloneBlend)
  gsap.to(lidAloneBlend, { v: lidAloneTarget(), duration: 0.7, ease: 'power3.out', delay })
  gsap.killTweensOf(lidHolderY)
  gsap.to(lidHolderY, { v: lidHolderTargetY(extraLid.mesh), duration: 0.7, ease: 'power3.out', delay })
  if (backMode()) {
    const t = lidPoseTarget()
    gsap.killTweensOf(lidPose)
    gsap.to(lidPose, { nx: t.nx, ny: t.ny, d: t.d, duration: 0.8, ease: 'power3.out', delay })
  }
}

function removeExtraLid() {
  if (!extraLid) return
  const lid = extraLid
  extraLid = null
  extraLidLabelEl?.classList.remove('visible')
  gsap.killTweensOf(lid.mesh.position)
  gsap.to(lid.mesh.position, {
    z: lid.restZ + EXTRA_LID_RISE, duration: 0.4, ease: 'power2.in',
    onComplete: () => lid.mesh.parent?.remove(lid.mesh),
  })
}

// Vertical extent of the stack, and (optionally) the extra lid at its rest
// spot, measured with the outer tilt/spin zeroed.
function stackSpanY(includeExtraLid) {
  const rx = outerGroup.rotation.x, ry = outerGroup.rotation.y
  const rz = outerGroup.rotation.z, py = outerGroup.position.y
  outerGroup.rotation.set(0, 0, 0)
  outerGroup.position.y = 0
  outerGroup.updateMatrixWorld(true)

  // Measure the pods (and top lid) at their rest spots, not wherever the
  // drop-in animation currently has them.
  const resting = [...sections, ...(lidSection ? [lidSection] : [])]
  const savedStackZ = resting.map(s => s.mesh.position.z)
  resting.forEach(s => { s.mesh.position.z = s.restZ })
  outerGroup.updateMatrixWorld(true)

  const box = new THREE.Box3()
  if (currentGlbScene) box.expandByObject(currentGlbScene)
  resting.forEach((s, i) => { s.mesh.position.z = savedStackZ[i] })
  if (includeExtraLid && extraLid) {
    // Measure the lid at its final orientation (with the outer tilt/spin zeroed
    // that is just the base orientation plus the tilt).
    const savedLidQ = lidHolder.quaternion.clone()
    const savedLidP = lidHolder.position.clone()
    lidHolder.rotation.set(THREE.MathUtils.degToRad(90) + lidTiltTarget(), 0, 0)
    lidHolder.position.set(0, lidHolderTargetY(extraLid.mesh), 0)
    const savedZ = extraLid.mesh.position.z
    extraLid.mesh.position.z = extraLid.restZ
    outerGroup.updateMatrixWorld(true)
    box.expandByObject(extraLid.mesh)
    extraLid.mesh.position.z = savedZ
    lidHolder.quaternion.copy(savedLidQ)
    lidHolder.position.copy(savedLidP)
  }

  outerGroup.rotation.x = rx; outerGroup.rotation.y = ry
  outerGroup.rotation.z = rz; outerGroup.position.y = py
  outerGroup.updateMatrixWorld(true)
  return { min: box.min.y, max: box.max.y }
}

// Camera distance and stack height for the current selection. With no extra
// lid, or no pods, this is exactly what it always was. With pods plus the
// lid, the stack and lid are re-centered together and the camera only backs
// off if the pair wouldn't otherwise fit in the frame.
function applyFraming() {
  if (inDetailView) return
  const base = idealCameraZ(currentPodTypes.length)
  let posY = OUTER_REST_POS_Y
  let camZ = base
  if (backMode() && extraLid && currentPodTypes.length) {
    camZ = base * LID_CORNER_PULLBACK
  } else if (!backMode() && extraLid && currentGlbScene && currentPodTypes.length) {
    const s = stackSpanY(false), a = stackSpanY(true)
    const stackH = s.max - s.min, allH = a.max - a.min
    if (stackH > 0) {
      posY = OUTER_REST_POS_Y - ((a.max + a.min) / 2 - (s.max + s.min) / 2)
      // Only back the camera off if stack + lid would otherwise run out of
      // frame: the camera sees 2 * z * tan(fov / 2) of height at distance z,
      // and the pair should use at most ~87% of that.
      const needed = allH * 1.15 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      camZ = Math.max(base, needed * CANVAS_SCALE)
      // Nudge everything down a few screen pixels (world units = px / px-per-unit
      // at the camera distance). The camera distance and the spacing between
      // the pods and the lid are untouched, so only the position changes.
      const pxPerUnit = canvasEl.getBoundingClientRect().height / (2 * camZ * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      posY -= LID_FRAMING_SHIFT_PX / pxPerUnit
    }
  }
  restPosY = posY
  CAMERA_REST_POS.z = camZ
  gsap.to(camera.position, { z: camZ, duration: 0.6, ease: 'power2.out' })
  if (!transitioning) gsap.to(outerGroup.position, { y: posY, duration: 0.6, ease: 'power2.out' })
}

// Adds, removes or repositions the extra lid to match the chip and the
// current pods, then re-frames.
function syncExtraLid(delay = 0) {
  const want = selected.addons.has('single-lid')
  if (want && !extraLid) { addExtraLid(delay); return }
  if (!want && extraLid) { removeExtraLid(); applyFraming(); return }
  if (want && extraLid) { moveExtraLid(delay); applyFraming() }
}

// Keeps the small "Extra lid" tag next to the lid (same projection the pod
// labels use), and hides it in the detail view or when there's no lid.
function updateExtraLidLabel() {
  if (!extraLid || inDetailView || transitioning) { extraLidLabelEl?.classList.remove('visible'); return }
  const el = ensureExtraLidLabel()
  if (!el) return
  const q = qtyOf('single-lid')
  const nameEl = el.querySelector('.blabel-name')
  const text = q > 1 ? `Single Lid ×${q}` : 'Single Lid'
  if (nameEl && nameEl.textContent !== text) nameEl.textContent = text

  if (backMode()) {
    // Under the lid, centered on its screen spot.
    if (!extraLid.mesh.visible) { el.classList.remove('visible'); return }
    const rect = canvasEl.getBoundingClientRect()
    el.classList.add('blabel-below'); el.classList.remove('blabel-right')
    // The lid turns, so hang the label from a steady spot: its screen center plus
    // roughly half its on-screen height (a flat lid is thin, a tilted one taller).
    const radiusPx = lidPose.d * rect.height * 0.5 * lidPose.g
    const halfH    = radiusPx * (0.42 + 0.28 * lidAloneBlend.v)
    el.style.left = ((lidPose.nx * 0.5 + 0.5) * rect.width) + 'px'
    el.style.top  = (((-lidPose.ny * 0.5 + 0.5) * rect.height) + halfH + (isMobile ? -2 : 10)) + 'px'
    el.classList.add('visible')
    return
  }
  el.classList.remove('blabel-below'); el.classList.add('blabel-right')

  const rx = outerGroup.rotation.x, ry = outerGroup.rotation.y
  const rz = outerGroup.rotation.z, py = outerGroup.position.y
  outerGroup.rotation.set(0, 0, 0)
  outerGroup.position.y = 0
  outerGroup.updateMatrixWorld(true)
  const box = new THREE.Box3()
  extraLid.mesh.traverse(c => { if (c.isMesh) box.expandByObject(c) })
  const center = new THREE.Vector3()
  box.getCenter(center)
  const anchor = outerGroup.worldToLocal(center)
  outerGroup.rotation.x = rx; outerGroup.rotation.y = ry
  outerGroup.rotation.z = rz; outerGroup.position.y = py
  outerGroup.updateMatrixWorld(true)

  const rect  = canvasEl.getBoundingClientRect()
  const world = anchor.clone()
  outerGroup.localToWorld(world)
  const ndc = world.project(camera)
  const edgeOffset = (rect.height / camera.position.z) * 0.95
  el.style.left = ((ndc.x * 0.5 + 0.5) * rect.width + edgeOffset) + 'px'
  el.style.top  = ((ndc.y * -0.5 + 0.5) * rect.height) + 'px'
  el.classList.add('visible')
}

// ── Render loop ──────────────────────────────────────────────
const clock = new THREE.Clock()
function animate() {
  requestAnimationFrame(animate)
  clock.getDelta()
  if (idleActive && modelLoaded) outerGroup.rotation.y += 0.004
  camera.lookAt(cameraTarget)
  updateLidHolderOrientation()
  updateLabels()
  updateExtraLidLabel()
  renderer.render(scene, camera)
}

new ResizeObserver(() => {
  const { w, h } = cSize()
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}).observe(wrap)

// ── Supplement pod logic ─────────────────────────────────────
function calcPods() {
  const powderPods = selected.powders.size
  const hybridPods = selected.hybrid.size > 0 ? Math.ceil(selected.hybrid.size / 2) : 0
  const pillPods   = selected.pills.size   > 0 ? Math.ceil(selected.pills.size   / 3) : 0
  return { powderPods, hybridPods, pillPods }
}

function getLabelNamesForPods(podTypes) {
  const pillNames   = [...selected.pills].map(id   => SUPPLEMENTS.pills.find(s => s.id === id).label)
  const hybridNames = [...selected.hybrid].map(id  => SUPPLEMENTS.hybrid.find(s => s.id === id).label)
  const powderNames = [...selected.powders].map(id => SUPPLEMENTS.powders.find(s => s.id === id).label)
  const pCopy = [...pillNames], hCopy = [...hybridNames], wCopy = [...powderNames]

  return podTypes.map(type => {
    if (type === 'Small Pill Pod'   && pCopy.length)  return pCopy.splice(0, 3).join(', ')
    if (type === 'Large Pill Pod' && hCopy.length)  return hCopy.splice(0, 2).join(', ')
    if (type === 'Powder Pod' && wCopy.length)  return wCopy.splice(0, 1)[0]
    return type
  })
}

const POD_IMAGES = {
  'Small Pill Pod':   'images/lifestyle_section/Pill Pod.png',
  'Large Pill Pod': 'images/lifestyle_section/Hybrid Pod.png',
  'Powder Pod': 'images/lifestyle_section/Powder Pod Render.png',
}
const POD_SPECS = {
  'Small Pill Pod':   '[pending mL]',
  'Large Pill Pod': '[pending mL]',
  'Powder Pod': '[pending mL]',
}

// Every order includes one free lid, same rule and same product (id
// 'single-lid-free', $7 list) as PilrCart's own auto-granted perk — kept
// in sync manually since there's no shared pricing config yet. Shown here
// purely as a preview line; PilrCart grants the real cart item itself the
// moment any pod lands in the cart, so this row never needs to touch
// currentCartTotal/currentCartListTotal.
const FREE_LID = {
  title: 'Single Lid',
  image: 'images/lifestyle_section/Full Render.png',
  listPrice: 7,
}
function makeLidRow(chevron) {
  return `<div class="sys-acc-row">
    <button class="sys-acc-header">
      <span class="sys-acc-dot"></span>
      <span class="sys-acc-name">${FREE_LID.title} <span class="sys-acc-supp">— <em>Included with your pods</em></span></span>
      <span class="sys-acc-price"><span class="sys-acc-price-strike">${formatPrice(FREE_LID.listPrice)}</span>Free</span>
      ${chevron}
    </button>
    <div class="sys-acc-body">
      <div class="sys-acc-expanded">
        <div class="sys-acc-pod-img-wrap">
          <img src="${FREE_LID.image}" alt="${FREE_LID.title}" class="sys-acc-pod-img" />
        </div>
        <div class="sys-acc-pod-info">
          <div class="sys-acc-info-field">
            <span class="sys-acc-info-label">Included</span>
            <span class="sys-acc-info-value">Free with the purchase of any pod — extra lids are available under add ons.</span>
          </div>
        </div>
      </div>
    </div>
  </div>`
}

// One row per selected ADD ONS chip — full price (no bundle discount),
// with its own Remove action that just deselects the chip.
function makeAddonRow(id, chevron) {
  const addon = ADD_ONS[id]
  if (!addon) return ''
  const qty   = qtyOf(id)
  const multi = (addon.maxQty ?? 1) > 1
  const open  = multi && openAddonRows.has(id) ? ' open' : ''
  const name  = multi && qty > 1 ? `${addon.label} ×${qty}` : addon.label
  const stepper = multi ? `
          <div class="sys-qty" data-addon-id="${id}">
            <span class="sys-qty-label">Quantity</span>
            <button type="button" class="sys-qty-btn" data-dir="-1" aria-label="Fewer ${addon.label}s"${qty <= 1 ? ' disabled' : ''}>−</button>
            <span class="sys-qty-val" aria-live="polite">${qty}</span>
            <button type="button" class="sys-qty-btn" data-dir="1" aria-label="More ${addon.label}s"${qty >= addon.maxQty ? ' disabled' : ''}>+</button>
          </div>` : ''
  return `<div class="sys-acc-row${open}" data-addon-row="${id}">
    <button class="sys-acc-header">
      <span class="sys-acc-dot"></span>
      <span class="sys-acc-name">${name}</span>
      <span class="sys-acc-price">${formatPrice(addon.price * qty)}</span>
      ${chevron}
    </button>
    <div class="sys-acc-body">
      <div class="sys-acc-expanded">
        <div class="sys-acc-pod-img-wrap">
          <img src="${addon.image}" alt="${addon.label}" class="sys-acc-pod-img" />
        </div>
        <div class="sys-acc-pod-info">${stepper}
          <div class="sys-acc-pod-actions">
            <button class="sys-acc-remove" data-addon-id="${id}">× Remove ${addon.label}${multi && qty > 1 ? 's' : ''}</button>
          </div>
        </div>
      </div>
    </div>
  </div>`
}

function updateSummary(pillPods, hybridPods, powderPods) {
  const el    = document.getElementById('system-summary-content')
  const total = pillPods + hybridPods + powderPods

  currentPodCounts = { pillPods, hybridPods, powderPods }
  const addonIds   = [...selected.addons]
  currentAddonIds  = addonIds
  const addonTotal = addonIds.reduce((sum, id) => sum + (ADD_ONS[id]?.price ?? 0) * qtyOf(id), 0)

  if (total === 0 && addonIds.length === 0) {
    el.innerHTML = '<p class="system-empty-state">Select your supplements<br>to build your system.</p>'
    currentCartTotal     = 0
    currentCartListTotal = 0
    isClassicStackCart = false
    updateCartButton()
    return
  }

  const pillIds   = [...selected.pills]
  const hybridIds = [...selected.hybrid]
  const powderIds = [...selected.powders]
  const pillNames   = pillIds.map(id   => SUPPLEMENTS.pills.find(s => s.id === id).label)
  const hybridNames = hybridIds.map(id => SUPPLEMENTS.hybrid.find(s => s.id === id).label)
  const powderNames = powderIds.map(id => SUPPLEMENTS.powders.find(s => s.id === id).label)

  const chevron = `<svg class="sys-acc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a8a94" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`

  const isClassicStack = pillPods === 1 && hybridPods === 1 && powderPods === 1
  isClassicStackCart = isClassicStack

  if (isClassicStack) {
    el.innerHTML = `<div class="sys-acc-list">
      <div class="sys-acc-row">
        <button class="sys-acc-header">
          <span class="sys-acc-dot"></span>
          <span class="sys-acc-name"><span class="sys-acc-bundle-badge">Best Value</span>The Classic Stack</span>
          <span class="sys-acc-price"><span class="sys-acc-price-strike">${formatPrice(CLASSIC_STACK_LIST_PRICE)}</span>${formatPrice(CLASSIC_STACK.price)}</span>
          ${chevron}
        </button>
        <div class="sys-acc-body">
          <div class="sys-acc-expanded">
            <div class="sys-acc-pod-img-wrap">
              <img src="${CLASSIC_STACK.image}" alt="The Classic Stack" class="sys-acc-pod-img" />
            </div>
            <div class="sys-acc-pod-info">
              <div class="sys-acc-info-field">
                <span class="sys-acc-info-label">Small Pill Pod</span>
                <span class="sys-acc-info-value">${pillNames.join(', ')}</span>
              </div>
              <div class="sys-acc-info-field">
                <span class="sys-acc-info-label">Large Pill Pod</span>
                <span class="sys-acc-info-value">${hybridNames.join(', ')}</span>
              </div>
              <div class="sys-acc-info-field">
                <span class="sys-acc-info-label">Powder Pod</span>
                <span class="sys-acc-info-value">${powderNames.join(', ')}</span>
              </div>
              <div class="sys-acc-pod-actions">
                <button class="sys-acc-remove" id="sys-acc-remove-bundle">× Remove Stack</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      ${makeLidRow(chevron)}
      ${addonIds.map(id => makeAddonRow(id, chevron)).join('')}
    </div>`

    currentCartTotal     = CLASSIC_STACK.price + addonTotal
    currentCartListTotal = CLASSIC_STACK_LIST_PRICE + addonTotal
    updateCartButton()

    el.querySelectorAll('.sys-acc-header').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.sys-acc-row')
        row.classList.toggle('open')
        if (row.dataset.addonRow) row.classList.contains('open') ? openAddonRows.add(row.dataset.addonRow) : openAddonRows.delete(row.dataset.addonRow)
      })
    })
    document.getElementById('sys-acc-remove-bundle')?.addEventListener('click', e => {
      e.stopPropagation()
      selected.pills.clear()
      selected.hybrid.clear()
      selected.powders.clear()
      document.querySelectorAll('.supp-chip.selected').forEach(chip => chip.classList.remove('selected'))
      updateSystem()
    })
    el.querySelectorAll('.sys-acc-remove[data-addon-id]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        removeAddon(btn.dataset.addonId)
        updateSystem()
      })
    })
    return
  }

  // Same tiered quantity discount as the product pages' "Add a Pod"
  // widget — driven by the TOTAL pod count across all three types.
  const discount = discountForQty(total)

  let cartTotal = 0
  let listTotal = 0

  function makeRow(podName, supps, category, ids) {
    const label     = supps.join(', ')
    const imgSrc    = POD_IMAGES[podName] || ''
    const spec      = POD_SPECS[podName]  || ''
    const idsAttr   = JSON.stringify(ids || [])
    const listPrice = POD_BASE_PRICE[podName]
    const salePrice = listPrice * (1 - discount)
    cartTotal += salePrice
    listTotal += listPrice
    const priceHtml = discount > 0
      ? `<span class="sys-acc-price"><span class="sys-acc-price-strike">${formatPrice(listPrice)}</span>${formatPrice(salePrice)}</span>`
      : `<span class="sys-acc-price">${formatPrice(listPrice)}</span>`
    return `<div class="sys-acc-row">
      <button class="sys-acc-header">
        <span class="sys-acc-dot"></span>
        <span class="sys-acc-name">${podName} <span class="sys-acc-supp">— <em>${label}</em></span></span>
        ${priceHtml}
        ${chevron}
      </button>
      <div class="sys-acc-body">
        <div class="sys-acc-expanded">
          <div class="sys-acc-pod-img-wrap">
            <img src="${imgSrc}" alt="${podName}" class="sys-acc-pod-img" />
          </div>
          <div class="sys-acc-pod-info">
            <div class="sys-acc-info-field">
              <span class="sys-acc-info-label">Contains</span>
              <span class="sys-acc-info-value">${label}</span>
            </div>
            <div class="sys-acc-info-field">
              <span class="sys-acc-info-label">Capacity</span>
              <span class="sys-acc-info-value">${spec}</span>
            </div>
            <div class="sys-acc-pod-actions">
              <button class="sys-acc-remove" data-category="${category}" data-ids='${idsAttr}'>× Remove Pod</button>
            </div>
          </div>
        </div>
      </div>
    </div>`
  }

  let rows = ''
  for (let i = 0; i < pillPods;   i++) rows += makeRow('Small Pill Pod',   pillNames.slice(i*3,(i+1)*3),   'pills',   pillIds.slice(i*3,(i+1)*3))
  for (let i = 0; i < hybridPods; i++) rows += makeRow('Large Pill Pod', hybridNames.slice(i*2,(i+1)*2), 'hybrid',  hybridIds.slice(i*2,(i+1)*2))
  for (let i = 0; i < powderPods; i++) rows += makeRow('Powder Pod', [powderNames[i]].filter(Boolean),'powders', [powderIds[i]].filter(Boolean))

  // The free lid only exists as a perk of buying a pod — don't show it
  // when the only thing selected is an ADD ONS chip with no pods.
  if (total > 0) rows += makeLidRow(chevron)
  rows += addonIds.map(id => makeAddonRow(id, chevron)).join('')
  el.innerHTML = `<div class="sys-acc-list">${rows}</div>`

  currentCartTotal     = cartTotal + addonTotal
  currentCartListTotal = listTotal + addonTotal
  updateCartButton()

  el.querySelectorAll('.sys-acc-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.sys-acc-row')
      row.classList.toggle('open')
      if (row.dataset.addonRow) row.classList.contains('open') ? openAddonRows.add(row.dataset.addonRow) : openAddonRows.delete(row.dataset.addonRow)
    })
  })

  el.querySelectorAll('.sys-acc-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      if (btn.dataset.addonId) {
        removeAddon(btn.dataset.addonId)
        updateSystem()
        return
      }
      const cat = btn.dataset.category
      const ids = JSON.parse(btn.dataset.ids)
      ids.forEach(id => {
        selected[cat].delete(id)
        document.querySelector(`.supp-chip[data-id="${id}"]`)?.classList.remove('selected')
      })
      updateSystem()
    })
  })
}

// ── Add to Cart ────────────────────────────────────────────────
function updateCartButton() {
  const btn = document.getElementById('system-add-to-cart-btn')
  if (!btn) return
  const totalQty = currentPodCounts.pillPods + currentPodCounts.hybridPods + currentPodCounts.powderPods + addonQtyTotal()
  btn.disabled = totalQty === 0
  if (totalQty === 0) {
    btn.textContent = 'Add to Cart'
    return
  }
  const hasDiscount = currentCartListTotal - currentCartTotal > 0.001
  const priceHtml   = hasDiscount
    ? `<span class="cart-btn-price-strike">${formatPrice(currentCartListTotal)}</span> ${formatPrice(currentCartTotal)}`
    : formatPrice(currentCartTotal)
  btn.innerHTML = 'Add to Cart — ' + priceHtml
}

document.getElementById('system-add-to-cart-btn')?.addEventListener('click', function() {
  const { pillPods, hybridPods, powderPods } = currentPodCounts
  const total = pillPods + hybridPods + powderPods
  if (total === 0 && currentAddonIds.length === 0) return

  if (total > 0) {
    if (isClassicStackCart) {
      window.PilrCart?.add(CLASSIC_STACK, 1)
    } else {
      const discount = discountForQty(total)
      const counts = { 'Small Pill Pod': pillPods, 'Large Pill Pod': hybridPods, 'Powder Pod': powderPods }
      Object.keys(counts).forEach(podName => {
        const qty = counts[podName]
        if (qty === 0) return
        const salePrice = POD_BASE_PRICE[podName] * (1 - discount)
        window.PilrCart?.add({
          id:    POD_CART_ID[podName],
          title: podName,
          price: salePrice,
          image: POD_IMAGES[podName],
        }, qty)
      })
    }
  }

  // ADD ONS are always full price — never folded into the pod bundle
  // discount above, and kept on their own paid ids so they stay separate
  // from the free lid/scooper perk PilrCart grants automatically.
  currentAddonIds.forEach(id => {
    const addon = ADD_ONS[id]
    if (!addon) return
    window.PilrCart?.add({ id, title: addon.label, price: addon.price, image: addon.image }, qtyOf(id))
  })

  const btn  = this
  const orig = btn.innerHTML
  btn.textContent = 'Added ✓'
  btn.disabled = true
  setTimeout(() => { btn.innerHTML = orig; btn.disabled = false }, 1200)
})

document.getElementById('system-summary-content')?.addEventListener('click', e => {
  const btn = e.target.closest('.sys-qty-btn')
  if (!btn || btn.disabled) return
  e.stopPropagation()
  const id    = btn.closest('.sys-qty')?.dataset.addonId
  const addon = ADD_ONS[id]
  if (!addon || !selected.addons.has(id)) return
  addonQty[id] = Math.max(1, Math.min(addon.maxQty ?? 1, qtyOf(id) + Number(btn.dataset.dir)))
  updateSystem()
})

function updateSystem() {
  const { powderPods, hybridPods, pillPods } = calcPods()
  const totalPods = powderPods + hybridPods + pillPods

  document.getElementById('selected-count').textContent =
    totalPods > 0 ? `${totalPods} pod${totalPods === 1 ? '' : 's'} selected` : ''

  // Build ordered pod list: pill (bottom) → hybrid (middle) → powder (top)
  const podList = [
    ...Array(pillPods).fill('Small Pill Pod'),
    ...Array(hybridPods).fill('Large Pill Pod'),
    ...Array(powderPods).fill('Powder Pod'),
  ]

  const stackToShow = podList
  const podKey = stackToShow.join(',')
  if (podKey !== lastPodKey) {
    lastPodKey = podKey
    buildStack(stackToShow, () => {
      // If the extra lid is out, it moves out of the way first: it starts
      // gliding to its new spot right away, and the pods wait a moment before
      // dropping in so they never pass in front of it.
      const lidInPlay = !!extraLid && selected.addons.has('single-lid')
      if (lidInPlay) syncExtraLid(0)
      playDrop(lidInPlay ? LID_HEAD_START : 0)
      // (Lid picked but not out yet: it rises in after the pods have dropped.)
      if (!lidInPlay) syncExtraLid(0.2 + (stackToShow.length + 1) * 0.18)
      if (!inDetailView) applyFraming()
    })
  } else {
    // Same stack shape — just update labels
    const labelNames = getLabelNamesForPods(podList)
    labelEls.forEach((el, i) => {
      const nameEl = el.querySelector('.blabel-name')
      if (nameEl) nameEl.textContent = labelNames[i] ?? currentPodTypes[i]
    })
    // Same pods: just add or remove the extra lid if that chip changed.
    syncExtraLid()
  }

  updateSummary(pillPods, hybridPods, powderPods)

  // The add-on chip reads "Extra Single Lid ×2" once there's more than one.
  document.querySelectorAll('#addons-row .supp-chip').forEach(chip => {
    const s = SUPPLEMENTS.addons.find(a => a.id === chip.dataset.id)
    if (!s) return
    const q = selected.addons.has(s.id) && (ADD_ONS[s.id]?.maxQty ?? 1) > 1 ? qtyOf(s.id) : 1
    chip.textContent = q > 1 ? `${s.label} ×${q}` : s.label
  })
}

// ── Chip renderer ────────────────────────────────────────────
function renderChips(category, containerId) {
  const container = document.getElementById(containerId)
  if (!container) return
  SUPPLEMENTS[category].forEach(s => {
    const btn = document.createElement('button')
    btn.className   = 'supp-chip'
    btn.textContent = s.label
    btn.type        = 'button'
    btn.dataset.id  = s.id
    btn.addEventListener('click', () => {
      if (selected[category].has(s.id)) {
        selected[category].delete(s.id)
        btn.classList.remove('selected')
        if (category === 'addons') { delete addonQty[s.id]; openAddonRows.delete(s.id) }
      } else {
        selected[category].add(s.id)
        btn.classList.add('selected')
        // A quantity-capable add-on opens its summary row so the − / + are visible.
        if (category === 'addons') { addonQty[s.id] = 1; if ((ADD_ONS[s.id]?.maxQty ?? 1) > 1) openAddonRows.add(s.id) }
      }
      updateSystem()
    })
    container.appendChild(btn)
  })
}

// ── Init ─────────────────────────────────────────────────────
renderChips('powders', 'powders-row')
renderChips('hybrid',  'hybrid-row')
renderChips('pills',   'pills-row')
renderChips('addons',  'addons-row')
animate()

// Nothing selected yet on first load — leave the canvas empty until the
// user actually picks a supplement, rather than previewing a Classic
// Stack nobody chose.
const initZ = idealCameraZ(0)
CAMERA_REST_POS.z = initZ
camera.position.z = initZ
buildStack([], () => playDrop())
