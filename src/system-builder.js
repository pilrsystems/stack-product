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
const POD_GLBS = {
  'Pill Pod':   './models/Configurations/pill_module_260520.glb',
  'Hybrid Pod': './models/Configurations/hybrid_pod_260520.glb',
  'Powder Pod': './models/Configurations/powder_pod_260520.glb',
}
const DIVIDER_GLB = './models/Configurations/divider_2026_0520.glb'

const POD_INFO = {
  'Pill Pod': {
    desc: 'Carries a full week of small and medium-sized capsules — organized across 3 compartments for easy access.',
    specs: ['Easy Dispense & Loading Mechanism', 'Height: 1 in.'],
    examples: 'Vitamin D, Zinc, Multivitamins…',
  },
  'Hybrid Pod': {
    desc: 'Organize a week\'s supply of larger pill supplements — or remove the divider for powder storage.',
    specs: ['2 capsule types or 1 powder? You choose.', 'Height: 2 in.'],
    examples: 'Fish Oil, Magnesium, Electrolytes, Creatine…',
  },
  'Powder Pod': {
    desc: 'Store a full week\'s supply of your go-to powders. 1 or 10? Stack as many as you\'d like.',
    specs: ['Includes 5g scooper', 'Height: 2.5 in.'],
    examples: 'Pre-Workout, Collagen, Greens Powder…',
  },
}

const DROP_OFFSET = 1.5   // scaled for individual pod GLB units
const FLY_OFFSET  = 2.0

// ── Selection state ──────────────────────────────────────────
const selected = { powders: new Set(), hybrid: new Set(), pills: new Set() }
let currentPodTypes = []
let lastPodKey      = ''

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
scene.background = new THREE.Color(0x2E4256)

// ── Camera ───────────────────────────────────────────────────
const CAMERA_REST_POS    = new THREE.Vector3(0, 0.4, 7)
const CAMERA_REST_TARGET = new THREE.Vector3(0, 0, 0)

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
const OUTER_REST_POS_Y = isMobile ? -0.25 : -0.5

const outerGroup = new THREE.Group()
outerGroup.rotation.z = OUTER_REST_ROT_Z
outerGroup.rotation.x = OUTER_REST_ROT_X
outerGroup.position.y = OUTER_REST_POS_Y
scene.add(outerGroup)

// ── Model state ──────────────────────────────────────────────
let sections        = []
let modelLoaded     = false
let currentGlbScene = null

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
    stackGroup.scale.setScalar(isMobile ? 18 : 16)
    stackGroup.rotation.x = THREE.MathUtils.degToRad(90)
    currentGlbScene = stackGroup
    outerGroup.add(stackGroup)

    const darkMat = new THREE.MeshStandardMaterial({
      color:     0x111111,
      roughness: 0.75,
      metalness: 0.0,
    })

    // Load all pods in parallel; also load divider for each Hybrid Pod
    const podGltfs = await Promise.all(podTypes.map(t => loadPod(POD_GLBS[t])))
    const dividerGltf = podTypes.includes('Hybrid Pod') ? await loadPod(DIVIDER_GLB) : null

    const gltfs = podGltfs.map((gltf, i) => {
      if (podTypes[i] === 'Hybrid Pod' && dividerGltf) {
        const dividerScene = dividerGltf.scene.clone()
        dividerScene.traverse(m => { if (m.isMesh) m.material = darkMat })
        dividerScene.position.y = 0.05
        gltf.scene.add(dividerScene)
      }
      return gltf
    })

    const podScenes = gltfs.map(gltf => {
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
    const podData = podScenes.map(s => {
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

      return {
        scene: s,
        zMin:  Math.min(lb2.min.z, lb2.max.z),
        zMax:  Math.max(lb2.min.z, lb2.max.z),
      }
    })

    // Use the smallest pod's bounding box as the uniform step, and
    // place each pod by its BB center — this equalises gaps across pod types
    const TIGHT      = 0.72
    const naturalStep = Math.min(...podData.map(d => (d.zMax - d.zMin))) * TIGHT
    // Cap total stack height so all pods always fit in the canvas
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

  labelEls.forEach((el, i) => {
    if (hidden) { el.classList.remove('visible'); return }
    const anchor = labelAnchors[i]
    if (!anchor) return

    const worldPos = anchor.clone()
    outerGroup.localToWorld(worldPos)
    const ndc = worldPos.clone().project(camera)

    if (ndc.z > 1) { el.classList.remove('visible'); return }

    el.style.left = ((ndc.x *  0.5 + 0.5) * rect.width)  + 'px'
    el.style.top  = ((ndc.y * -0.5 + 0.5) * rect.height) + 'px'
    el.classList.add('visible')
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
  const camPos   = new THREE.Vector3(center.x, center.y + height, center.z + 0.05)

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

function updateSummary(pillPods, hybridPods, powderPods) {
  const el    = document.getElementById('system-summary-content')
  const total = pillPods + hybridPods + powderPods

  if (total === 0) {
    el.innerHTML = '<p class="system-empty-state">Select your supplements<br>to build your system.</p>'
    return
  }

  const pillNames   = [...selected.pills].map(id   => SUPPLEMENTS.pills.find(s => s.id === id).label)
  const hybridNames = [...selected.hybrid].map(id  => SUPPLEMENTS.hybrid.find(s => s.id === id).label)
  const powderNames = [...selected.powders].map(id => SUPPLEMENTS.powders.find(s => s.id === id).label)

  let html = ''

  if (pillPods > 0) html += `<div class="system-pod-row">
    <div class="system-pod-header">
      <span class="system-pod-name">Pill Pod</span>
      <span class="system-pod-qty">×${pillPods}</span>
    </div>
    <div class="system-pod-supplements">${pillNames.join(', ')}</div>
  </div>`

  if (hybridPods > 0) html += `<div class="system-pod-row">
    <div class="system-pod-header">
      <span class="system-pod-name">Hybrid Pod</span>
      <span class="system-pod-qty">×${hybridPods}</span>
    </div>
    <div class="system-pod-supplements">${hybridNames.join(', ')}</div>
  </div>`

  if (powderPods > 0) html += `<div class="system-pod-row">
    <div class="system-pod-header">
      <span class="system-pod-name">Powder Pod</span>
      <span class="system-pod-qty">×${powderPods}</span>
    </div>
    <div class="system-pod-supplements">${powderNames.join(', ')}</div>
  </div>`

  html += `<div class="system-total-row">
    <span class="system-total-label">Total Pods</span>
    <span class="system-total-count">${total}</span>
  </div>`

  el.innerHTML = html
}

function updateSystem() {
  const { powderPods, hybridPods, pillPods } = calcPods()
  const total = selected.powders.size + selected.hybrid.size + selected.pills.size

  document.getElementById('selected-count').textContent =
    total > 0 ? `${total} supplement${total === 1 ? '' : 's'} selected` : ''

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
    buildStack(stackToShow, () => playDrop())
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
buildStack(DEFAULT_STACK, () => playDrop())
