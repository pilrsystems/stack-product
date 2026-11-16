// Pre-order progress + button label, shared by every product page.
//
// PRE-ORDERS CLAIMED: CLAIMED below is the fallback shown until the live count loads (and
// whenever it can't). The live count comes from Shopify through /api/preorder-count.
const CLAIMED = 0
const GOAL = 1000

const fmt = (n) => n.toLocaleString('en-US')

document.body.classList.add('has-preorder-bar')

function render(claimed, goal) {
  const pct = Math.max(0, Math.min(100, (claimed / goal) * 100))
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
      node.nodeValue = node.nodeValue.replace(/ADD TO CART/i, 'PRE-ORDER')
      changed = true
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
