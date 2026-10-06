import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import gsap from 'gsap'

// ── Pre-made stack configurations ──────────────────────────
// layers: GLB node names in order (bottom → lid). Last entry is always lid (not clickable).
// pods:   UI pod names matching each clickable layer (all except lid).
const CONFIGS = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Your all-in-one daily stack',
    pods: ['Pill Pod', 'Hybrid Pod', 'Powder Pod'],
    layers: ['bottom', 'middle', 'top', 'lid'],
    commonStack: 'Vitamin D, Zinc, B12 → Omega-3, Magnesium → Creatine',
    accent: '#8BB8C8',
    glb: './models/Configurations/Classic.glb',
  },
  {
    id: 'powder-heavy',
    name: 'Powder Heavy',
    tagline: 'For those whose routine leans more on powders',
    pods: ['Pill Pod', 'Hybrid Pod', 'Powder Pod', 'Powder Pod'],
    layers: ['bottom', 'middle', 'middle_2', 'top', 'lid'],
    commonStack: 'Vitamin D, Zinc, Multivitamin → Electrolytes → Greens Powder → Collagen',
    accent: '#7AAFC8',
    glb: './models/Configurations/Powder_Heavy.glb',
  },
  {
    id: 'capsule-loader',
    name: 'Capsule Loader',
    tagline: 'All capsules, no powders',
    pods: ['Pill Pod', 'Hybrid Pod', 'Hybrid Pod'],
    layers: ['bottom', 'middle', 'top', 'lid'],
    commonStack: 'B12, Zinc, Vitamin D → Fish Oil, CoQ10 → Magnesium, Turmeric',
    accent: '#A89CC4',
    glb: './models/Configurations/Capsule_Loader.glb',
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    tagline: 'Just the essentials — light and compact',
    pods: ['Pill Pod', 'Hybrid Pod'],
    layers: ['bottom', 'top', 'lid'],
    commonStack: 'Ashwagandha, Zinc, Turmeric → Magnesium and Omega-3 or Electrolytes',
    accent: '#A8C4A0',
    glb: './models/Configurations/Minimalist.glb',
  },
  {
    id: 'serious-traveler',
    name: 'Serious Traveler',
    tagline: 'Full coverage, every trip',
    pods: ['Pill Pod', 'Hybrid Pod', 'Hybrid Pod', 'Powder Pod'],
    layers: ['bottom', 'middle', 'middle_up', 'top', 'lid'],
    commonStack: 'Melatonin, Ibuprofen, Charcoal → Magnesium, Multivitamin → Creatine → Greens Powder',
    accent: '#C4B89C',
    glb: './models/Configurations/Serious_Traveller.glb',
  },
]

// ── Pod detail info ──────────────────────────────────────────
const POD_INFO = {
  'Pill Pod': {
    desc: 'Carries a full week of small and medium-sized capsules — organized across 3 compartments for easy access.',
    specs: ['Easy Dispense & Loading Mechanism', 'Height: 1 in.'],
    examples: 'Vitamin D, Zinc, Multivitamins…',
  },
  'Hybrid Pod': {
    desc: 'Organize a week\'s supply of larger pill supplements — or remove the divider for powder storage. Start with one. Stack as many as you need.',
    specs: ['2 capsule types or 1 powder? You choose.', 'Height: 2 in.'],
    examples: 'Fish Oil, Magnesium, Electrolytes, Creatine…',
  },
  'Powder Pod': {
    desc: 'Store a full week\'s supply of your go-to powders. 1 or 10? Stack as many as you\'d like.',
    specs: ['Includes 5g scooper', 'Height: 2.5 in.'],
    examples: 'Pre-Workout, Collagen, Greens Powder…',
  },
}

const DROP_OFFSET = 400   // GLB local units: ~8 world units off-screen
const FLY_OFFSET  = 600   // GLB local units: sections fly off when disassembling

// ── Renderer ────────────────────────────────────────────────
const canvasEl = document.getElementById('builder-canvas')
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
const CAMERA_REST_TARGET = new THREE.Vector3(isMobile ? 0.6 : -0.6, 0, 0)

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

// Shadow-only floor
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
const OUTER_REST_POS_Y = isMobile ? -1.5 : -2.2

const outerGroup = new THREE.Group()
outerGroup.rotation.z = OUTER_REST_ROT_Z
outerGroup.rotation.x = OUTER_REST_ROT_X
outerGroup.position.y = OUTER_REST_POS_Y
scene.add(outerGroup)

// ── Model state ──────────────────────────────────────────────
let sections        = []   // [{mesh: Object3D, restZ: number}]
let modelLoaded     = false
let currentGlbScene = null // reference to the currently loaded gltf.scene

// ── Label state ──────────────────────────────────────────────
let labelEls     = []
let labelAnchors = []

// ── Interaction state ────────────────────────────────────────
let idleActive    = true
let inDetailView  = false
let transitioning = false

// ── GLB loader ───────────────────────────────────────────────
const loader = new GLTFLoader()

function loadGLB(url, layers, onReady) {
  // Remove previous model
  if (currentGlbScene) {
    outerGroup.remove(currentGlbScene)
    currentGlbScene = null
  }
  sections    = []
  modelLoaded = false

  loader.load(url, (gltf) => {
    const glbScene = gltf.scene
    currentGlbScene = glbScene
    glbScene.scale.setScalar(0.020)
    glbScene.rotation.x = THREE.MathUtils.degToRad(90)
    outerGroup.add(glbScene)

    // All entries except the last (lid) are clickable pods
    layers.forEach((name, i) => {
      let found = null
      glbScene.traverse(child => {
        if (!found && child.name.toLowerCase() === name.toLowerCase()) found = child
      })
      if (!found) {
        console.warn(`[STACK Builder] Layer "${name}" not found in GLB: ${url}`)
        return
      }
      found.traverse(m => { if (m.isMesh) m.castShadow = true })
      sections.push({ mesh: found, restZ: found.position.z })
    })

    modelLoaded = true
    document.getElementById('builder-loading')?.classList.add('hidden')
    computeLabelAnchors()
    if (onReady) onReady()
  }, undefined, (err) => {
    console.error(`[STACK Builder] Failed to load ${url}:`, err)
    document.getElementById('builder-loading')?.classList.add('hidden')
  })
}

// ── Label system ─────────────────────────────────────────────
function initLabels(cfg) {
  const container = document.getElementById('builder-labels')
  if (!container) return
  container.innerHTML = ''
  labelEls = []

  // Clickable pods = all entries except the last (lid)
  cfg.pods.forEach((podName, i) => {
    const side = i % 2 === 0 ? 'right' : 'left'
    const el   = document.createElement('div')
    el.className = `blabel blabel-${side}`
    el.innerHTML = `
      <div class="blabel-dot"></div>
      <div class="blabel-line"></div>
      <div class="blabel-text">
        <span class="blabel-name">${podName}</span>
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
  const rx = outerGroup.rotation.x, ry = outerGroup.rotation.y
  const rz = outerGroup.rotation.z, py = outerGroup.position.y

  outerGroup.rotation.set(0, 0, 0)
  outerGroup.position.y = 0
  outerGroup.updateMatrixWorld(true)

  // Clickable sections = all except last (lid)
  const clickable = sections.slice(0, sections.length - 1)
  labelAnchors = clickable.map(s => {
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

function setLabelNames(cfg) {
  labelEls.forEach((el, i) => {
    const nameEl = el.querySelector('.blabel-name')
    if (nameEl) nameEl.textContent = cfg.pods[i] ?? ''
  })
}

// ── Drop animation ───────────────────────────────────────────
function playDrop() {
  if (!sections.length) return
  sections.forEach(s => gsap.killTweensOf(s.mesh.position))
  sections.forEach(s => { s.mesh.position.z = s.restZ - DROP_OFFSET })

  const tl = gsap.timeline()
  sections.forEach((s, i) => {
    tl.to(s.mesh.position, {
      z: s.restZ,
      duration: 0.72,
      ease: 'power3.out',
    }, i * 0.18)
  })
}

// ── Pod detail view ──────────────────────────────────────────
function getSectionDetailSetup(sectionIndex) {
  const rx = outerGroup.rotation.x
  const ry = outerGroup.rotation.y
  const rz = outerGroup.rotation.z
  const py = outerGroup.position.y

  outerGroup.rotation.set(0, 0, 0)
  outerGroup.position.y = 0
  outerGroup.updateMatrixWorld(true)

  const box = new THREE.Box3()
  sections[sectionIndex].mesh.traverse(child => {
    if (child.isMesh) box.expandByObject(child)
  })

  const center = new THREE.Vector3()
  const size   = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)

  const halfSpan = Math.max(size.x, size.z) / 2
  const height   = Math.max((halfSpan / Math.tan(THREE.MathUtils.degToRad(20))) * 1.4, 3.5)
  const camPos   = new THREE.Vector3(center.x, center.y + height, center.z + 0.05)

  outerGroup.rotation.x = rx
  outerGroup.rotation.y = ry
  outerGroup.rotation.z = rz
  outerGroup.position.y = py
  outerGroup.updateMatrixWorld(true)

  return { center, camPos }
}

function enterDetailView(sectionIndex) {
  if (inDetailView || transitioning || !modelLoaded) return
  transitioning = true

  idleActive = false
  gsap.to(outerGroup.rotation, { y: 0, duration: 0.4, ease: 'power2.out' })

  sections.forEach((s, i) => {
    if (i === sectionIndex) return
    const dir = i < sectionIndex ? FLY_OFFSET : -FLY_OFFSET
    gsap.to(s.mesh.position, {
      z: s.restZ + dir,
      duration: 0.55,
      ease: 'power2.in',
      delay: 0.05,
    })
  })

  gsap.to(outerGroup.rotation, { x: 0, z: 0, duration: 0.85, ease: 'power2.inOut' })
  gsap.to(outerGroup.position, { y: 0,          duration: 0.85, ease: 'power2.inOut' })

  const { center: podCenter, camPos: detailCamPos } = getSectionDetailSetup(sectionIndex)
  const detailCamTarget = podCenter.clone()

  gsap.to(camera.position, {
    x: detailCamPos.x, y: detailCamPos.y, z: detailCamPos.z,
    duration: 1.05, ease: 'power2.inOut',
  })
  gsap.to(cameraTarget, {
    x: detailCamTarget.x, y: detailCamTarget.y, z: detailCamTarget.z,
    duration: 1.05, ease: 'power2.inOut',
    onComplete: () => { transitioning = false; inDetailView = true },
  })

  document.getElementById('pod-back-btn')?.classList.add('visible')
  document.querySelector('.builder-selected-info')?.classList.add('hidden')
  document.querySelector('.builder-layout')?.classList.add('detail-active')

  const cfg     = CONFIGS.find(c => c.id === activeConfigId)
  const podName = cfg?.pods[sectionIndex] ?? ''
  showPodPanel(podName)
}

function exitDetailView() {
  if (!inDetailView || transitioning) return
  transitioning = true
  inDetailView  = false

  document.getElementById('pod-back-btn')?.classList.remove('visible')
  document.querySelector('.builder-selected-info')?.classList.remove('hidden')
  document.querySelector('.builder-layout')?.classList.remove('detail-active')
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
    gsap.to(s.mesh.position, {
      z: s.restZ, duration: 0.7, ease: 'power3.out', delay: 0.25 + i * 0.08,
    })
  })
}

// ── Pod detail panel ─────────────────────────────────────────
function showPodPanel(podName) {
  const info  = POD_INFO[podName]
  const panel = document.getElementById('pod-detail-panel')
  if (!panel) return

  document.getElementById('pod-detail-name').textContent = podName
  document.getElementById('pod-detail-desc').textContent = info?.desc ?? ''
  const specsList = document.getElementById('pod-detail-specs')
  specsList.innerHTML = (info?.specs ?? []).map(s => `<li>${s}</li>`).join('')
  document.getElementById('pod-detail-examples').textContent = info?.examples ?? ''

  panel.classList.add('visible')
}

function hidePodPanel() {
  document.getElementById('pod-detail-panel')?.classList.remove('visible')
}

// ── Config selection ─────────────────────────────────────────
let activeConfigId = null

function updateOverlay(cfg) {
  const nameEl  = document.getElementById('selected-config-name')
  const descEl  = document.getElementById('selected-config-desc')
  const podsEl  = document.getElementById('selected-config-pods')
  const stackEl = document.getElementById('selected-config-common-stack')
  if (nameEl)  nameEl.textContent  = cfg.name
  if (descEl)  descEl.textContent  = cfg.tagline
  if (podsEl)  podsEl.innerHTML    = cfg.pods.map(p => `<span class="pod-tag">${p}</span>`).join('')
  if (stackEl) stackEl.textContent = cfg.commonStack || ''
}

function selectConfig(cfg, cardEl) {
  if (cfg.id === activeConfigId && !inDetailView) return
  if (inDetailView) exitDetailView()
  activeConfigId = cfg.id

  document.querySelectorAll('.config-card').forEach(c => c.classList.remove('active'))
  cardEl.classList.add('active')

  updateOverlay(cfg)
  initLabels(cfg)

  // Show loading, swap GLB
  document.getElementById('builder-loading')?.classList.remove('hidden')
  loadGLB(cfg.glb, cfg.layers, () => {
    setLabelNames(cfg)
    playDrop()
  })
}

// ── Populate panel ───────────────────────────────────────────
function populatePanel() {
  const list = document.getElementById('config-list')
  if (!list) return

  CONFIGS.forEach((cfg, i) => {
    const card = document.createElement('div')
    card.className = 'config-card' + (i === 0 ? ' active' : '')
    card.dataset.id = cfg.id
    card.innerHTML = `
      <div class="config-card-accent" style="background:${cfg.accent}"></div>
      <div class="config-card-body">
        <div class="config-card-name">${cfg.name}</div>
        <div class="config-card-tagline">${cfg.tagline}</div>
        <div class="config-card-count">${cfg.pods.length} pods</div>
      </div>
      <div class="config-card-arrow">→</div>
    `
    card.addEventListener('click', () => selectConfig(cfg, card))
    list.appendChild(card)
  })

  activeConfigId = CONFIGS[0].id
  updateOverlay(CONFIGS[0])
}

// ── Raycaster ────────────────────────────────────────────────
const raycaster = new THREE.Raycaster()
const mouse     = new THREE.Vector2()

function getClickableMeshes() {
  const result = []
  // All sections except the last (lid) are clickable
  const clickable = sections.slice(0, sections.length - 1)
  clickable.forEach((s, i) => {
    s.mesh.traverse(m => {
      if (m.isMesh) result.push({ mesh: m, index: i })
    })
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
  if (hits.length > 0) {
    const found = candidates.find(c => c.mesh === hits[0].object)
    if (found) enterDetailView(found.index)
  }
})

canvasEl.addEventListener('mousemove', (e) => {
  if (inDetailView || transitioning || !modelLoaded) {
    canvasEl.style.cursor = 'default'
    return
  }
  const rect = canvasEl.getBoundingClientRect()
  mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)

  const candidates = getClickableMeshes()
  canvasEl.style.cursor = raycaster.intersectObjects(candidates.map(c => c.mesh)).length > 0 ? 'pointer' : 'default'
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
  if (hits.length > 0) {
    const found = candidates.find(c => c.mesh === hits[0].object)
    if (found) enterDetailView(found.index)
  }
}, { passive: true })

document.getElementById('pod-back-btn')?.addEventListener('click', exitDetailView)

// ── Render loop ──────────────────────────────────────────────
const clock = new THREE.Clock()
function animate() {
  requestAnimationFrame(animate)
  const delta = clock.getDelta()
  if (idleActive) outerGroup.rotation.y += 0.004 * delta * 60
  camera.lookAt(cameraTarget)
  updateLabels()
  renderer.render(scene, camera)
}

// ── Resize ───────────────────────────────────────────────────
new ResizeObserver(() => {
  const { w, h } = cSize()
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}).observe(wrap)

// ── Init ─────────────────────────────────────────────────────
populatePanel()
initLabels(CONFIGS[0])
animate()
loadGLB(CONFIGS[0].glb, CONFIGS[0].layers, () => playDrop())
