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
    } else {
      const item = cart.items.find(i => i.id === id)
      if (item) item.quantity = quantity
    }
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
    return getCart().items.reduce((sum, i) => sum + i.price * i.quantity, 0)
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
  }
})(window)
