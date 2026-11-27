// Pre-order progress + button label, shared by every product page.
//
// PRE-ORDERS CLAIMED: CLAIMED below is the fallback shown until the live count loads (and
// whenever it can't). The live count comes from Shopify through /api/preorder-count.
const CLAIMED = 0
const GOAL = 1000
// The top banner shows only "Pre-orders now open" until this many spots are claimed; from here on
// it alternates that message with the claim bar and the count.
const SHOW_COUNT_FROM = 0
const BANNER_MS = 3000   // how long each banner message stays up

const fmt = (n) => n.toLocaleString('en-US')

// ── Top banner: "Pre-orders now open" <-> the claim count, crossfading (every screen size) ──
const bar = document.querySelector('.preorder-bar')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let rotation = null
let held = false   // hover / keyboard focus pauses the rotation

function bannerAria() {
  if (!bar) return
  const open = bar.querySelector('.pob-msg--open')
  const claim = bar.querySelector('.pob-msg--claim')
  const rotate = bar.dataset.mode === 'rotate'
  const both = rotate && reduceMotion.matches   // both messages on screen at once
  const showClaim = bar.classList.contains('is-claim')
  open.setAttribute('aria-hidden', both || !showClaim ? 'false' : 'true')
  claim.setAttribute('aria-hidden', both || (rotate && showClaim) ? 'false' : 'true')
}
function stopRotation() { clearInterval(rotation); rotation = null }
function startRotation() {
  stopRotation()
  if (!bar || held || bar.dataset.mode !== 'rotate' || reduceMotion.matches) return
  rotation = setInterval(() => { bar.classList.toggle('is-claim'); bannerAria() }, BANNER_MS)
}
function renderBanner(claimed, goal, pct) {
  if (!bar) return
  const rotate = claimed >= SHOW_COUNT_FROM
  bar.dataset.mode = rotate ? 'rotate' : 'static'
  if (!rotate) bar.classList.remove('is-claim')
  bar.style.setProperty('--pob-pct', pct + '%')
  const track = bar.querySelector('[role="progressbar"]')   // the old claim bar; the banner now just says how many spots there are
  if (track) { track.setAttribute('aria-valuenow', String(claimed)); track.setAttribute('aria-valuemax', String(goal)) }
  bannerAria()
  startRotation()
}
if (bar) {
  bar.addEventListener('mouseenter', () => { held = true; stopRotation() })
  bar.addEventListener('mouseleave', () => { held = false; startRotation() })
  bar.addEventListener('focusin', () => { held = true; stopRotation() })
  bar.addEventListener('focusout', () => { held = false; startRotation() })
  reduceMotion.addEventListener('change', () => { bannerAria(); startRotation() })
}

function render(claimed, goal) {
  const pct = Math.max(0, Math.min(100, (claimed / goal) * 100))
  renderBanner(claimed, goal, pct)
  document.querySelectorAll('[data-preorder-claimed]').forEach((el) => { el.textContent = fmt(claimed) })
  document.querySelectorAll('[data-preorder-goal]').forEach((el) => { el.textContent = fmt(goal) })
  document.querySelectorAll('[data-preorder-left]').forEach((el) => { el.textContent = fmt(Math.max(0, goal - claimed)) })
  document.querySelectorAll('[data-preorder-fill]').forEach((el) => { el.style.width = pct + '%' })
}
render(CLAIMED, GOAL)

// Live number from Shopify (netlify/functions/preorder-count.mjs). If it isn't available
// (local dev, function not set up yet, Shopify error) the number above stays.
fetch('/api/preorder-count')
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => { if (d && typeof d.claimed === 'number') render(d.claimed, Number(d.goal) || GOAL) })
  .catch(() => {})

// "ADD TO CART" becomes "PRE-ORDER" (the main button also shows the price when it has none of its own).
function titlePrice() {
  const el = document.querySelector('.product-title-price')
  const m = el && el.textContent.match(/\$\s?[\d.,]+/)
  return m ? m[0].replace(/\s/g, '') : ''
}
function relabel(btn, withPrice) {
  const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT)
  let node
  let changed = false
  while ((node = walker.nextNode())) {
    if (/ADD TO CART/i.test(node.nodeValue)) {
      // a button can carry its own full label (the Full Stack one: "PRE-ORDER — $54.40 WITH CODE")
      node.nodeValue = btn.dataset.preorderLabel ? btn.dataset.preorderLabel : node.nodeValue.replace(/ADD TO CART/i, 'PRE-ORDER')
      changed = !btn.dataset.preorderLabel
    }
  }
  if (changed && withPrice && btn.textContent.trim() === 'PRE-ORDER') {
    const p = titlePrice()
    if (p) btn.appendChild(document.createTextNode(' — ' + p))
  }
}
function watch(btn, withPrice) {
  let busy = false
  const run = () => {
    if (busy) return
    busy = true
    relabel(btn, withPrice)
    busy = false
  }
  run()
  new MutationObserver(run).observe(btn, { childList: true, characterData: true, subtree: true })
}
document.querySelectorAll('.product-btn-add').forEach((b) => watch(b, true))
document.querySelectorAll('.product-sticky-cta').forEach((b) => watch(b, false))
