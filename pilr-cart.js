// ── pilr Cart ────────────────────────────────────────────────────────────────
// localStorage-based cart. When Shopify goes live, replace the storage layer
// (getCart / saveCart) with fetch calls to /cart.js and /cart/change.js.
// The public API surface stays the same so all product-page code still works.

;(function(global) {
  const STORAGE_KEY = 'pilr_cart'

  // Classic Stack always comes with a free travel scooper. Kept as its own
  // id (not 'travel-scooper') so it never merges with a scooper someone
  // bought on its own at full price — the cart would have no way to tell
  // a free unit and a paid one apart once merged into a single line's
  // shared price/quantity. listPrice is display-only (see cart.html); the
  // real `price` is 0, so totals already count it as free with no special
  // casing needed there.
  const FREE_SCOOPER_PRODUCT = {
    id: 'travel-scooper-free',
    title: 'Travel Scooper',
    price: 0,
    listPrice: 9,
    image: 'images/lifestyle_section/Scooper.png',
  }

  // Every order comes with one lid free, whichever pod(s) it's for — unlike
  // the scooper above (Classic Stack only), this triggers off any pod
  // product being in the cart at all. Kept as its own id (not 'single-lid')
  // for the same reason as the scooper: so it never merges with lids bought
  // on their own at full price (someone wanting a spare), which still use
  // the paid 'single-lid' id and stay unaffected by any of this.
  const FREE_LID_PRODUCT = {
    id: 'single-lid-free',
    title: 'Single Lid',
    price: 0,
    listPrice: 7,
    image: 'images/lifestyle_section/Full Render.png',
  }
  const PODS_THAT_INCLUDE_A_FREE_LID = ['pill-pod', 'hybrid-pod', 'powder-pod', 'classic-stack']

  // Both free perks can now be bumped up from their own cart row (someone
  // wanting a spare scooper or lid right from their cart instead of a
  // separate product page visit) — the first unit of each stays free, any
  // beyond that are charged at the normal per-unit price. This is a running
  // TOTAL for the whole line (not a flat per-unit price times quantity),
  // since "first one free" isn't expressible as a single per-unit number:
  // qty 1 → $0, qty 2 → one base price, qty 3 → two base prices, etc. Both
  // getCartTotal below and cart.html's own per-row display call this so the
  // order subtotal and the line's own price always agree.
  const FIRST_UNIT_FREE_BASE_PRICE = { 'travel-scooper-free': 9, 'single-lid-free': 7 }
  function freePerkLineTotal(id, quantity) {
    const basePrice = FIRST_UNIT_FREE_BASE_PRICE[id]
    if (basePrice == null) return null
    return Math.max(0, quantity - 1) * basePrice
  }

  // Same bundle-discount curve as each pod product page's own "Add a Pod"
  // widget (pill/hybrid/powder-pod.html each keep a local copy of this for
  // their own live preview before anything's in the cart). Mirrored here so
  // the cart itself is the authority on what a pod actually costs once it's
  // really in there — see repriceStackingPods below.
  const STACKING_POD_BASE_PRICE = { 'pill-pod': 24, 'hybrid-pod': 28, 'powder-pod': 32 }
  const STACKING_POD_DISCOUNT_BY_QTY = [0, 0, 0.10, 0.15, 0.20, 0.25, 0.28]
  function stackingPodDiscountForQty(qty) {
    return STACKING_POD_DISCOUNT_BY_QTY[Math.min(qty, STACKING_POD_DISCOUNT_BY_QTY.length - 1)]
  }

  // Recomputes price/listPrice for every pill-pod/hybrid-pod/powder-pod line
  // based on their COMBINED quantity across the whole cart, then re-saves.
  // Called after every add/quantity change so the discount keeps stacking
  // correctly no matter where a pod's count last changed — a product page's
  // Add a Pod panel, or the cart's own qty stepper — rather than only ever
  // reflecting whatever was true the moment a line was first added.
  function repriceStackingPods(cart) {
    const totalQty = cart.items
      .filter(i => STACKING_POD_BASE_PRICE[i.id] != null)
      .reduce((sum, i) => sum + i.quantity, 0)
    const discount = stackingPodDiscountForQty(totalQty)
    cart.items.forEach(i => {
      const basePrice = STACKING_POD_BASE_PRICE[i.id]
      if (basePrice == null) return
      i.price = Math.round(basePrice * (1 - discount) * 100) / 100
      i.listPrice = basePrice
    })
    return cart
  }

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { items: [] }
    } catch (_) {
      return { items: [] }
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart))
    global.dispatchEvent(new CustomEvent('pilr:cart-updated', { detail: cart }))
  }

  // Add or increment a product. `product` shape:
  //   { id, title, price, image, variantId? }
  // variantId is unused locally but will be needed for Shopify.
  function addToCart(product, quantity) {
    quantity = quantity || 1
    const cart = getCart()
    const existing = cart.items.find(i => i.id === product.id)
    if (existing) {
      existing.quantity += quantity
    } else {
      cart.items.push({ ...product, quantity })
    }
    if (product.id === 'classic-stack' && !cart.items.some(i => i.id === FREE_SCOOPER_PRODUCT.id)) {
      cart.items.push({ ...FREE_SCOOPER_PRODUCT, quantity: 1 })
    }
    if (PODS_THAT_INCLUDE_A_FREE_LID.includes(product.id) && !cart.items.some(i => i.id === FREE_LID_PRODUCT.id)) {
      cart.items.push({ ...FREE_LID_PRODUCT, quantity: 1 })
    }
    repriceStackingPods(cart)
    saveCart(cart)
    return cart
  }

  function updateQuantity(id, quantity) {
    const cart = getCart()
    if (quantity <= 0) {
      cart.items = cart.items.filter(i => i.id !== id)
      // The free scooper perk goes away with the Classic Stack it came with.
      if (id === 'classic-stack') {
        cart.items = cart.items.filter(i => i.id !== FREE_SCOOPER_PRODUCT.id)
      }
      // The free lid goes away once no pod that earns one is left in the cart.
      if (PODS_THAT_INCLUDE_A_FREE_LID.includes(id) && !cart.items.some(i => PODS_THAT_INCLUDE_A_FREE_LID.includes(i.id))) {
        cart.items = cart.items.filter(i => i.id !== FREE_LID_PRODUCT.id)
      }
    } else {
      const item = cart.items.find(i => i.id === id)
      if (item) item.quantity = quantity
    }
    repriceStackingPods(cart)
    saveCart(cart)
    return cart
  }

  function removeFromCart(id) {
    return updateQuantity(id, 0)
  }

  function getCartCount() {
    return getCart().items.reduce((sum, i) => sum + i.quantity, 0)
  }

  function getCartTotal() {
    return getCart().items.reduce((sum, i) => {
      const freeTotal = freePerkLineTotal(i.id, i.quantity)
      return sum + (freeTotal != null ? freeTotal : i.price * i.quantity)
    }, 0)
  }

  function clearCart() {
    saveCart({ items: [] })
  }

  // ── Nav badge ─────────────────────────────────────────────────────────────
  // Injects a count bubble on every cart icon found in the page.
  function updateNavBadge() {
    const count = getCartCount()
    document.querySelectorAll('.nav-cart-badge').forEach(el => el.remove())
    if (count === 0) return
    document.querySelectorAll('.nav-cart-btn, .nav-cart-icon').forEach(el => {
      const badge = document.createElement('span')
      badge.className = 'nav-cart-badge'
      badge.textContent = count > 9 ? '9+' : count
      el.style.position = 'relative'
      el.appendChild(badge)
    })
  }

  global.addEventListener('pilr:cart-updated', updateNavBadge)
  document.addEventListener('DOMContentLoaded', updateNavBadge)

  // ── Expose public API ─────────────────────────────────────────────────────
  global.PilrCart = {
    get: getCart,
    add: addToCart,
    updateQuantity,
    remove: removeFromCart,
    count: getCartCount,
    total: getCartTotal,
    clear: clearCart,
    freePerkLineTotal,
  }
})(window)
