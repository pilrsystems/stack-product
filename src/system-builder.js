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
  ],
  hybrid: [
    { id: 'fishoil',      label: 'Fish Oil / Omega-3' },
    { id: 'magnesium',    label: 'Magnesium' },
    { id: 'multivitamin', label: 'Multivitamin' },
    { id: 'ltheanine',    label: 'L-Theanine' },
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
  ],
}

// ── Individual pod GLB paths ─────────────────────────────────
// Hybrid/Powder extracted from stack-bottle.glb (the homepage hero
// model's four named parts — see extract-pods.mjs) since that model's
// geometry looks noticeably better than the original Configurations
// set. Each export has the rotation + 1000x scale correction already
// baked in, so it drops into the exact same transform chain below
// unmodified. Pill Pod stays on the original Configurations asset —
// stack-bottle.glb's Pill Pod reflects an older product design that
// still has a dispenser-flap cutout, which the real product no
// longer has.
const POD_GLBS = {
  'Pill Pod':   './models/Configurations/pill_module_260520.glb',
  'Hybrid Pod': './models/Configurations/Hybrid%20Pod%20New.glb',
  'Powder Pod': './models/Configurations/Powder%20Pod%20New.glb',
}

// ── Pricing ────────────────────────────────────────────────────
// Same base prices and tiered quantity discount curve as the "Add a
// Pod" widget on the single-pod product pages (pill-pod.html etc.) —
// kept in sync manually since there's no shared pricing config in the
// codebase yet; see pill-pod.html for the source of truth.
const POD_BASE_PRICE  = { 'Pill Pod': 20, 'Hybrid Pod': 23, 'Powder Pod': 29 }
const POD_CART_ID     = { 'Pill Pod': 'pill-pod', 'Hybrid Pod': 'hybrid-pod', 'Powder Pod': 'powder-pod' }
const DISCOUNT_BY_QTY = [0, 0, 0.10, 0.15, 0.20, 0.25, 0.28] // index = total pods, 6+ capped at index 6
function discountForQty(qty) { return DISCOUNT_BY_QTY[Math.min(qty, 6)] }
function formatPrice(n) { return '$' + (Number.isInteger(n) ? n : n.toFixed(2)) }

const POD_INFO = {
  'Pill Pod': {
    desc: 'Built for the small capsules you take every day. Three compartments, a full week, one pod.',
    specs: ['[Size] mL'],
    examples: 'Vitamin D, Zinc, Multivitamins, etc.',
  },
  'Hybrid Pod': {
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
const selected = { powders: new Set(), hybrid: new Set(), pills: new Set() }
let currentPodTypes = []
// Latest pod counts/total — read by the "Add to Cart" click handler so
// it doesn't need to recompute calcPods() itself.
let currentPodCounts = { pillPods: 0, hybridPods: 0, powderPods: 0 }
let currentCartTotal = 0
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

// Returns the ideal camera Z so the full stack fits in the viewport
function idealCameraZ(podCount) {
  if (podCount <= 1) return 4.7
  if (podCount === 2) return 5.0
  return 4.7 + (podCount - 1) * 0.72   // 3→6.1, 4→6.8, 5→7.6
}

const camera = new THREE.PerspectiveCamera(40, CW / CH, 0.1, 50)
camera.position.copy(CAMERA_REST_POS)
const cameraTarget = CAMERA_REST_TARGET.clone()

// ── Lights ───────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.35))

const key = new THREE.DirectionalLight(0xffffff, 4.5)
key.position.set(5, 8, 6)
key.castShadow = !isMobile
key.shadow.mapSize.set(1024, 1024)
key.shadow.bias = -0.001
scene.add(key)

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
const OUTER_REST_POS_Y = isMobile ? 0.05 : -0.15

const outerGroup = new THREE.Group()
outerGroup.rotation.z = OUTER_REST_ROT_Z
outerGroup.rotation.x = OUTER_REST_ROT_X
outerGroup.position.y = OUTER_REST_POS_Y
scene.add(outerGroup)

// ── Model state ──────────────────────────────────────────────
let sections        = []
let modelLoaded     = false
let currentGlbScene = null
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

// ── Build stack from individual pod GLBs ─────────────────────
async function buildStack(podTypes, onReady) {
  const mySeq = ++buildSeq   // claim this build slot; any prior in-flight build is now stale

  if (inDetailView) exitDetailView()

  if (currentGlbScene) {
    outerGroup.remove(currentGlbScene)
    currentGlbScene = null
  }
  sections        = []
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

    // Load all pods in parallel. The new Hybrid Pod GLB (extracted from
    // stack-bottle.glb) already has its own internal divider wall
    // modeled in, unlike the old Configurations Hybrid Pod which was an
    // empty shell needing a separate divider_2026_0520.glb piece added
    // on top — doing that here now would overlay a second, perpendicular
    // wall and make the pod look like it has 4 compartments instead of 2.
    const podGltfs = await Promise.all(podTypes.map(t => loadPod(POD_GLBS[t])))

    // A newer buildStack call started while we were loading — discard this result
    if (mySeq !== buildSeq) {
      document.getElementById('system-loading')?.classList.add('hidden')
      return
    }

    const podScenes = podGltfs.map(gltf => {
      const s = gltf.scene
      s.traverse(m => {
        if (m.isMesh) {
          m.castShadow = true
          m.material   = darkMat
        }
      })
      stackGroup.add(s)
      return s
    })
    outerGroup.updateMatrixWorld(true)

    const invMat = new THREE.Matrix4().copy(stackGroup.matrixWorld).invert()
    const podData = podScenes.map((s, i) => {
      // Rotate each pod -90° around X so height axis goes along stackGroup -Z
      // which after stackGroup rotation.x=90 maps to world +Y (upright)
      s.rotation.x = THREE.MathUtils.degToRad(-90)
      outerGroup.updateMatrixWorld(true)

      const worldBox = new THREE.Box3().setFromObject(s)
      const localBox = worldBox.clone().applyMatrix4(invMat)

      // Center pod at x=0, y=0 in stackGroup so all pods share the same axis
      const cx = (localBox.min.x + localBox.max.x) / 2
      const cy = (localBox.min.y + localBox.max.y) / 2
      s.position.x -= cx
      s.position.y -= cy

      // Re-measure after centering
      outerGroup.updateMatrixWorld(true)
      const wb2 = new THREE.Box3().setFromObject(s)
      const lb2 = wb2.clone().applyMatrix4(invMat)

      const height = Math.abs(lb2.max.z - lb2.min.z)
      // Cache every pod type's measured height the first time we see it.
      // The default stack (Pill + Hybrid + Powder) loads on page load,
      // before any selection is possible, so by the time the user picks
      // anything this cache already holds all three — see HEIGHT_CACHE
      // below for why that matters.
      if (!(podTypes[i] in HEIGHT_CACHE)) HEIGHT_CACHE[podTypes[i]] = height

      return {
        scene: s,
        zMin:  Math.min(lb2.min.z, lb2.max.z),
        zMax:  Math.max(lb2.min.z, lb2.max.z),
      }
    })

    // Gap between pod centers. Previously based on Math.min() of only the
    // *currently selected* pods' heights, so the gap visibly changed
    // depending on which pod types happened to be in the stack (e.g.
    // Powder+Hybrid used Hybrid's height instead of Pill Pod's, since Pill
    // Pod wasn't in that selection) — HEIGHT_CACHE instead remembers every
    // pod type's height across the whole session, so this is always the
    // same global minimum (Pill Pod's height) regardless of what's
    // currently selected, matching the gap the default Classic Stack
    // shows on first load.
    const TIGHT       = 0.72
    const naturalStep = Math.min(...Object.values(HEIGHT_CACHE)) * TIGHT
    // Cap total stack height so unusually large selections (many
    // duplicate pods) still fit the canvas instead of overflowing it.
    const MAX_HEIGHT = 0.26
    const maxStep    = podData.length > 1 ? MAX_HEIGHT / (podData.length - 1) : naturalStep
    const step       = Math.min(naturalStep, maxStep)

    const totalHeight = step * (podData.length - 1)
    let stackZ = totalHeight / 2

    // Per-type center fraction: Pill Pod geometry sits toward the top of its BB
    // so we bias the center upward to close the gap it creates below
    const CENTER_BIAS = { 'Pill Pod': 0.72, 'Hybrid Pod': 0.5, 'Powder Pod': 0.5 }

    for (let i = 0; i < podData.length; i++) {
      const { scene: s, zMin, zMax } = podData[i]
      const bias     = CENTER_BIAS[podTypes[i]] ?? 0.5
      const bbCenter = zMin + (zMax - zMin) * bias

      s.position.z = stackZ - bbCenter
      outerGroup.updateMatrixWorld(true)

      sections.push({ mesh: s, restZ: s.position.z })
      stackZ -= step
    }

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
function playDrop() {
  if (!sections.length) return
  sections.forEach(s => gsap.killTweensOf(s.mesh.position))
  sections.forEach(s => { s.mesh.position.z = s.restZ - DROP_OFFSET })

  const tl = gsap.timeline()
  sections.forEach((s, i) => {
    tl.to(s.mesh.position, { z: s.restZ, duration: 0.72, ease: 'power3.out' }, i * 0.18)
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
  gsap.to(outerGroup.position, { y: OUTER_REST_POS_Y, duration: 0.9, ease: 'power2.inOut' })

  sections.forEach((s, i) => {
    gsap.to(s.mesh.position, { z: s.restZ, duration: 0.7, ease: 'power3.out', delay: 0.25 + i * 0.08 })
  })
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

// ── Render loop ──────────────────────────────────────────────
const clock = new THREE.Clock()
function animate() {
  requestAnimationFrame(animate)
  clock.getDelta()
  if (idleActive && modelLoaded) outerGroup.rotation.y += 0.004
  camera.lookAt(cameraTarget)
  updateLabels()
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
    if (type === 'Pill Pod'   && pCopy.length)  return pCopy.splice(0, 3).join(', ')
    if (type === 'Hybrid Pod' && hCopy.length)  return hCopy.splice(0, 2).join(', ')
    if (type === 'Powder Pod' && wCopy.length)  return wCopy.splice(0, 1)[0]
    return type
  })
}

const POD_IMAGES = {
  'Pill Pod':   'images/lifestyle_section/Pill Pod.png',
  'Hybrid Pod': 'images/lifestyle_section/Hybrid Pod.png',
  'Powder Pod': 'images/lifestyle_section/Powder Pod Render.png',
}
const POD_SPECS = {
  'Pill Pod':   'Holds up to 3 pill & small capsule supplements',
  'Hybrid Pod': 'Holds up to 2 large capsule or softgel supplements',
  'Powder Pod': 'Holds up to ~75g of powder',
}

function updateSummary(pillPods, hybridPods, powderPods) {
  const el    = document.getElementById('system-summary-content')
  const total = pillPods + hybridPods + powderPods

  currentPodCounts = { pillPods, hybridPods, powderPods }

  if (total === 0) {
    el.innerHTML = '<p class="system-empty-state">Select your supplements<br>to build your system.</p>'
    currentCartTotal = 0
    updateCartButton()
    return
  }

  const pillIds   = [...selected.pills]
  const hybridIds = [...selected.hybrid]
  const powderIds = [...selected.powders]
  const pillNames   = pillIds.map(id   => SUPPLEMENTS.pills.find(s => s.id === id).label)
  const hybridNames = hybridIds.map(id => SUPPLEMENTS.hybrid.find(s => s.id === id).label)
  const powderNames = powderIds.map(id => SUPPLEMENTS.powders.find(s => s.id === id).label)

  // Same tiered quantity discount as the product pages' "Add a Pod"
  // widget — driven by the TOTAL pod count across all three types.
  const discount = discountForQty(total)

  const chevron = `<svg class="sys-acc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a8a94" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`

  let cartTotal = 0

  function makeRow(podName, supps, category, ids) {
    const label     = supps.join(', ')
    const imgSrc    = POD_IMAGES[podName] || ''
    const spec      = POD_SPECS[podName]  || ''
    const idsAttr   = JSON.stringify(ids || [])
    const listPrice = POD_BASE_PRICE[podName]
    const salePrice = listPrice * (1 - discount)
    cartTotal += salePrice
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
  for (let i = 0; i < pillPods;   i++) rows += makeRow('Pill Pod',   pillNames.slice(i*3,(i+1)*3),   'pills',   pillIds.slice(i*3,(i+1)*3))
  for (let i = 0; i < hybridPods; i++) rows += makeRow('Hybrid Pod', hybridNames.slice(i*2,(i+1)*2), 'hybrid',  hybridIds.slice(i*2,(i+1)*2))
  for (let i = 0; i < powderPods; i++) rows += makeRow('Powder Pod', [powderNames[i]].filter(Boolean),'powders', [powderIds[i]].filter(Boolean))

  rows += `<button class="sys-acc-add" id="sys-acc-add-btn">Add another supplement +</button>`
  el.innerHTML = `<div class="sys-acc-list">${rows}</div>`

  currentCartTotal = cartTotal
  updateCartButton()

  el.querySelectorAll('.sys-acc-header').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.sys-acc-row').classList.toggle('open'))
  })

  el.querySelectorAll('.sys-acc-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const cat = btn.dataset.category
      const ids = JSON.parse(btn.dataset.ids)
      ids.forEach(id => {
        selected[cat].delete(id)
        document.querySelector(`.supp-chip[data-id="${id}"]`)?.classList.remove('selected')
      })
      updateSystem()
    })
  })

  document.getElementById('sys-acc-add-btn')?.addEventListener('click', () => window.showBysSelector?.())
}

// ── Add to Cart ────────────────────────────────────────────────
function updateCartButton() {
  const btn = document.getElementById('system-add-to-cart-btn')
  if (!btn) return
  const totalQty = currentPodCounts.pillPods + currentPodCounts.hybridPods + currentPodCounts.powderPods
  btn.disabled   = totalQty === 0
  btn.textContent = totalQty > 0 ? 'Add to Cart — ' + formatPrice(currentCartTotal) : 'Add to Cart'
}

document.getElementById('system-add-to-cart-btn')?.addEventListener('click', function() {
  const { pillPods, hybridPods, powderPods } = currentPodCounts
  const total = pillPods + hybridPods + powderPods
  if (total === 0) return

  const discount = discountForQty(total)
  const counts = { 'Pill Pod': pillPods, 'Hybrid Pod': hybridPods, 'Powder Pod': powderPods }
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

  const btn  = this
  const orig = btn.textContent
  btn.textContent = 'Added ✓'
  btn.disabled = true
  setTimeout(() => { btn.textContent = orig; btn.disabled = false }, 1200)
})

function updateSystem() {
  const { powderPods, hybridPods, pillPods } = calcPods()
  const totalPods = powderPods + hybridPods + pillPods

  document.getElementById('selected-count').textContent =
    totalPods > 0 ? `${totalPods} pod${totalPods === 1 ? '' : 's'} selected` : ''

  // Build ordered pod list: pill (bottom) → hybrid (middle) → powder (top)
  const podList = [
    ...Array(pillPods).fill('Pill Pod'),
    ...Array(hybridPods).fill('Hybrid Pod'),
    ...Array(powderPods).fill('Powder Pod'),
  ]

  const stackToShow = podList.length ? podList : DEFAULT_STACK
  const podKey = stackToShow.join(',')
  if (podKey !== lastPodKey) {
    lastPodKey = podKey
    buildStack(stackToShow, () => {
      playDrop()
      if (!inDetailView) {
        const targetZ = idealCameraZ(stackToShow.length)
        CAMERA_REST_POS.z = targetZ
        gsap.to(camera.position, { z: targetZ, duration: 0.6, ease: 'power2.out' })
      }
    })
  } else {
    // Same stack shape — just update labels
    const labelNames = getLabelNamesForPods(podList)
    labelEls.forEach((el, i) => {
      const nameEl = el.querySelector('.blabel-name')
      if (nameEl) nameEl.textContent = labelNames[i] ?? currentPodTypes[i]
    })
  }

  updateSummary(pillPods, hybridPods, powderPods)
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
      } else {
        selected[category].add(s.id)
        btn.classList.add('selected')
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
animate()

// Default: show full system as a preview
const DEFAULT_STACK = ['Pill Pod', 'Hybrid Pod', 'Powder Pod']
const initZ = idealCameraZ(DEFAULT_STACK.length)
CAMERA_REST_POS.z = initZ
camera.position.z = initZ
buildStack(DEFAULT_STACK, () => playDrop())
