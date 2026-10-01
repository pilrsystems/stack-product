// Run from anywhere: `node scripts/extract-pods.mjs`.
import { NodeIO } from '@gltf-transform/core'
import { prune, center, dedup } from '@gltf-transform/functions'
import * as THREE from 'three'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// system-builder.js wraps every pod in `stackGroup.rotation.x = +90°`
// then ALSO sets `pod.rotation.x = -90°` on the loaded scene root —
// those two cancel out (net 0 extra rotation), unlike cylinder.js which
// only applies +90° once. Verified empirically in a disposable test
// viewer: the raw stack-bottle.glb nodes alone (net-0 chain) render
// top-down/on their side, not upright. So we bake the missing
// +90°-about-X correction directly into each node's own rotation here,
// composed with its existing raw quaternion, so the result is correct
// when run through system-builder.js's existing (unmodified) chain.
function bakeCorrection(rawQuat) {
  const raw = new THREE.Quaternion(...rawQuat)
  const correction = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
  return correction.multiply(raw)
}

// Maps stack-bottle.glb's node names to the real pod names (per
// animation.js's LABEL_MAP / the production homepage label markup:
// top=Powder Pod, middle=Hybrid Pod, bottom=Pill Pod, lid=Multi-Pod Lid).
const PARTS = [
  { nodeName: 'top',    outFile: 'Powder Pod New.glb' },
  { nodeName: 'middle', outFile: 'Hybrid Pod New.glb' },
  { nodeName: 'bottom', outFile: 'Pill Pod New.glb' },
  { nodeName: 'lid',    outFile: 'Multi-Pod Lid New.glb' },
]

for (const { nodeName, outFile } of PARTS) {
  const io = new NodeIO()
  const doc = await io.read(resolve(ROOT, 'public/models/stack-bottle.glb'))
  const root = doc.getRoot()
  const scene = root.listScenes()[0]

  const toRemove = scene.listChildren().filter(n => n.getName() !== nodeName)
  toRemove.forEach(n => n.dispose())

  const kept = scene.listChildren().find(n => n.getName() === nodeName)
  if (!kept) {
    console.error('Node not found:', nodeName)
    continue
  }

  const bakedQuat = bakeCorrection(kept.getRotation())
  kept.setRotation([bakedQuat.x, bakedQuat.y, bakedQuat.z, bakedQuat.w])

  // stack-bottle.glb's raw units are ~1000x the old Configurations pod
  // files' raw units (confirmed by comparing X-diameter bboxes: 64.68
  // vs 0.06468, an exact 1000x ratio — old assets are authored in
  // meters, these in millimeters). system-builder.js's stackGroup scale
  // (16.5x) was tuned for the old assets, so without this correction
  // the new geometry would render ~1000x too large.
  const SCALE_CORRECTION = 0.001
  kept.setScale([SCALE_CORRECTION, SCALE_CORRECTION, SCALE_CORRECTION])

  await doc.transform(
    prune(),
    dedup(),
    center({ pivot: 'center' })
  )

  const outPath = resolve(ROOT, `public/models/Configurations/${outFile}`)
  await io.write(outPath, doc)
  console.log('Wrote', outPath)
}
