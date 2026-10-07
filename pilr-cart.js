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
  // shared price/quantity. listPrice is display-only (see getItemDisplay
  // below); the real `price` is 0, so totals already count it as free with
  // no special casing needed there.
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

  // Both free perks can be bumped up from their own cart row — the first
  // unit of each stays free, any beyond that are charged at the normal
  // per-unit price. This is a running TOTAL for the whole line (not a flat
  // per-unit price times quantity), since "first one free" isn't
  // expressible as a single per-unit number: qty 1 → $0, qty 2 → one base
  // price, qty 3 → two base prices, etc. getCartTotal and getItemDisplay
  // both call this so every price shown anywhere always agrees.
  const FREE_SHIPPING_THRESHOLD = 75

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
  // Add a Pod panel, the full cart page's qty stepper, or the drawer's own
  // qty stepper — rather than only ever reflecting whatever was true the
  // moment a line was first added.
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

  function formatMoney(dollars) {
    // Whole-dollar amounts show as "$24", not "$24.00" — same convention as
    // system-builder.js's own formatPrice. Rounded first so float noise
    // (e.g. 32 * 0.85 - style multiplication) doesn't spuriously trip the
    // decimal branch.
    const rounded = Math.round(dollars * 100) / 100
    return '$' + (Number.isInteger(rounded) ? rounded : rounded.toFixed(2))
  }

  // Maps a cart line's id to its own product page, so a UI can link an item
  // back to where it was bought. The two free-perk ids share their paid
  // counterpart's page.
  const PRODUCT_PAGE_BY_ID = {
    'pill-pod': 'pill-pod.html',
    'hybrid-pod': 'hybrid-pod.html',
    'powder-pod': 'powder-pod.html',
    'classic-stack': 'classic-stack.html',
    'travel-scooper': 'travel-scooper.html',
    'travel-scooper-free': 'travel-scooper.html',
    'single-lid': 'single-lid.html',
    'single-lid-free': 'single-lid.html',
  }

  // Short one-line blurb shown under each cart drawer row, Hears-style
  // ("Great, your ears will thank you."). Free-perk ids share their paid
  // counterpart's line.
  const PRODUCT_BLURB_BY_ID = {
    'pill-pod': 'Keeps your pills organized.',
    'hybrid-pod': 'Fits medium and large capsules.',
    'powder-pod': 'Keeps your powder fresh.',
    'classic-stack': 'Your whole routine, one system.',
    'travel-scooper': 'Scoop and go, anywhere.',
    'travel-scooper-free': 'Scoop and go, anywhere.',
    'single-lid': 'Locks every pod shut tight.',
    'single-lid-free': 'Locks every pod shut tight.',
  }

  // Fixed (not quantity-discount-dependent) list prices, keyed by id, for
  // backfilling cart items that were added to localStorage before a given
  // product started carrying its own listPrice field - so an older cart
  // line still shows the correct struck-through price instead of needing
  // the shopper to remove and re-add it. Pod lines bought at a bundle
  // discount tier aren't backfillable this way since their list price
  // depends on what else was in the cart at add-time, not just the id.
  const STATIC_LIST_PRICE_BY_ID = {
    'classic-stack': 84,
  }

  // Single source of truth for how a cart line's price should be shown,
  // used by both cart.html's full-page list and the nav cart drawer so the
  // two views can never drift from each other.
  function getItemDisplay(item) {
    const freeTotal = freePerkLineTotal(item.id, item.quantity)
    const listPrice = item.listPrice ?? STATIC_LIST_PRICE_BY_ID[item.id] ?? null
    const lineTotal = freeTotal != null ? freeTotal : item.price * item.quantity
    const lineListTotal = listPrice != null ? listPrice * item.quantity : null
    // Still at just the one free unit — the UI shows "FREE" outright. Once
    // bumped past that it behaves like any other discounted line: struck-
    // through full price next to what's actually charged.
    const isFree = freeTotal === 0
    const hasDiscount = !isFree && lineListTotal != null && lineListTotal > lineTotal
    return {
      href: PRODUCT_PAGE_BY_ID[item.id] || null,
      lineTotal,
      lineListTotal,
      isFree,
      hasDiscount,
      isPerk: freeTotal != null,
    }
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

  // ── Cart drawer ───────────────────────────────────────────────────────────
  // A slide-in panel that opens from the nav cart icon on every page instead
  // of navigating to cart.html. cart.html still exists as a full-page
  // fallback (direct links/bookmarks), so its own cart icon is left to
  // behave normally rather than popping a redundant drawer over a page
  // that's already showing the same thing.
  const DRAWER_ID = 'pilr-cart-drawer'

  function buildDrawer() {
    if (document.getElementById(DRAWER_ID)) return

    const overlay = document.createElement('div')
    overlay.className = 'cart-drawer-overlay'
    overlay.id = 'cart-drawer-overlay'

    const drawer = document.createElement('aside')
    drawer.className = 'cart-drawer'
    drawer.id = DRAWER_ID
    drawer.setAttribute('aria-hidden', 'true')
    drawer.innerHTML =
      '<div class="cart-drawer-header">' +
        '<h2>Cart<span class="cart-drawer-count" id="cart-drawer-count"></span></h2>' +
        '<button type="button" class="cart-drawer-close" aria-label="Close cart">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="cart-drawer-shipping" id="cart-drawer-shipping"></div>' +
      '<div class="cart-drawer-body" id="cart-drawer-body"></div>' +
      '<div class="cart-drawer-footer" id="cart-drawer-footer"></div>'

    document.body.appendChild(overlay)
    document.body.appendChild(drawer)

    overlay.addEventListener('click', closeDrawer)
    drawer.querySelector('.cart-drawer-close').addEventListener('click', closeDrawer)

    // Delegated so newly-rendered rows (every renderDrawer() call replaces
    // the body's innerHTML) stay wired without re-attaching listeners.
    drawer.querySelector('#cart-drawer-body').addEventListener('click', e => {
      const removeBtn = e.target.closest('.cart-drawer-remove')
      const qtyBtn = e.target.closest('.cart-drawer-qty-btn')
      if (removeBtn) {
        removeFromCart(removeBtn.dataset.key)
        renderDrawer()
      } else if (qtyBtn) {
        const key = qtyBtn.dataset.key
        const valEl = qtyBtn.closest('.cart-drawer-item').querySelector('.cart-drawer-qty-val')
        const qty = parseInt(valEl.textContent, 10)
        const next = qtyBtn.dataset.action === 'increase' ? qty + 1 : Math.max(0, qty - 1)
        updateQuantity(key, next)
        renderDrawer()
      }
    })
  }

  function isDrawerOpen() {
    const drawer = document.getElementById(DRAWER_ID)
    return !!drawer && drawer.classList.contains('open')
  }

  function openDrawer() {
    buildDrawer()
    renderDrawer()
    const overlay = document.getElementById('cart-drawer-overlay')
    const drawer = document.getElementById(DRAWER_ID)
    // Locking body alone isn't enough — on pages where <body> has no scroll
    // context of its own, the browser scrolls <html> instead, and that
    // scrollbar stays visible (and usable) right in the drawer's own
    // right-edge gap. Locking both keeps the page truly non-scrollable
    // while open, leaving only the drawer's own internal scrollbar (on
    // .cart-drawer-body) for when the item list overflows.
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    // The very first open builds the drawer (closed, transform: 100%) and
    // would otherwise add .open in the same synchronous tick, with no
    // flushed style in between for the browser to animate from — the
    // slide-in silently skips on that first click only (a later open
    // doesn't have this problem, since the drawer's already sitting there
    // closed, already flushed, from a prior close). Reading offsetHeight
    // forces a synchronous layout flush of the closed state right before
    // .open changes it, giving the transition a real starting point.
    void drawer.offsetHeight
    overlay.classList.add('open')
    drawer.classList.add('open')
    drawer.setAttribute('aria-hidden', 'false')
  }

  function closeDrawer() {
    const overlay = document.getElementById('cart-drawer-overlay')
    const drawer = document.getElementById(DRAWER_ID)
    if (!overlay || !drawer) return
    overlay.classList.remove('open')
    drawer.classList.remove('open')
    drawer.setAttribute('aria-hidden', 'true')
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
  }

  // Truck/checkmark badge icon stays fixed at the end of the track — only
  // the fill width moves as the cart total grows, same as the Hears
  // reference this is modeled on. stroke="currentColor" so the badge's
  // CSS text color (dark slate when locked, white once done) drives both
  // icons instead of hardcoding white — the locked badge's background is
  // now light, so a white icon would've been invisible on it.
  // Proportions borrowed from Feather's "truck" icon (well-centered within
  // a 24x24 viewBox already) rather than a custom shape that measured
  // visually off-center at this badge's small size.
  const SHIPPING_TRUCK_ICON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4.5" width="15" height="13"/><polygon points="16 9 20 9 23 12 23 17.5 16 17.5 16 9"/><circle cx="5.5" cy="19" r="2.1"/><circle cx="18.5" cy="19" r="2.1"/></svg>'
  const SHIPPING_CHECK_ICON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 7 9.5 17.5 4 12"/></svg>'

  function shippingBarHtml() {
    const total     = getCartTotal()
    const remaining = FREE_SHIPPING_THRESHOLD - total
    const unlocked  = remaining <= 0
    const pct       = Math.min(100, Math.max(0, (total / FREE_SHIPPING_THRESHOLD) * 100))
    const msg       = unlocked
      ? "Congratulations! You've unlocked FREE shipping!"
      : "You're " + formatMoney(remaining) + ' away from free shipping.'
    return (
      '<p class="cart-drawer-shipping-msg">' + msg + '</p>' +
      '<div class="cart-drawer-shipping-bar">' +
        '<div class="cart-drawer-shipping-track">' +
          '<div class="cart-drawer-shipping-fill" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<div class="cart-drawer-shipping-icon' + (unlocked ? ' cart-drawer-shipping-icon--done' : '') + '">' +
          (unlocked ? SHIPPING_CHECK_ICON : SHIPPING_TRUCK_ICON) +
        '</div>' +
      '</div>'
    )
  }

  function drawerItemRowHtml(item) {
    const d = getItemDisplay(item)
    const priceInner = d.isFree
      ? '<span class="cart-drawer-free-badge">Free</span>'
      : d.hasDiscount
        ? '<span class="cart-item-price-strike">' + formatMoney(d.lineListTotal) + '</span>' + formatMoney(d.lineTotal)
        : formatMoney(d.lineTotal)
    const href = d.href
    return (
      '<div class="cart-drawer-item" data-key="' + item.id + '">' +
        (href ? '<a class="cart-drawer-item-img" href="' + href + '">' : '<div class="cart-drawer-item-img">') +
          '<img src="' + item.image + '" alt="' + item.title + '" />' +
        (href ? '</a>' : '</div>') +
        '<div class="cart-drawer-item-info">' +
          '<p class="cart-drawer-item-name">' + (href ? '<a href="' + href + '">' + item.title + '</a>' : item.title) + '</p>' +
          '<p class="cart-drawer-item-price">' + priceInner + '</p>' +
          (PRODUCT_BLURB_BY_ID[item.id] ? '<p class="cart-drawer-item-desc">' + PRODUCT_BLURB_BY_ID[item.id] + '</p>' : '') +
        '</div>' +
        '<div class="cart-drawer-item-actions">' +
          '<div class="cart-drawer-qty-ctrl">' +
            '<button type="button" class="cart-drawer-qty-btn" data-action="decrease" data-key="' + item.id + '">-</button>' +
            '<span class="cart-drawer-qty-val">' + item.quantity + '</span>' +
            '<button type="button" class="cart-drawer-qty-btn" data-action="increase" data-key="' + item.id + '">+</button>' +
          '</div>' +
          '<button type="button" class="cart-drawer-remove" data-key="' + item.id + '">Remove</button>' +
        '</div>' +
      '</div>'
    )
  }

  // Every renderDrawer() call rebuilds the footer's innerHTML from scratch
  // (quantities/subtotal have to, to stay current) — tracked separately so
  // the promo accordion doesn't silently re-collapse on the next qty or
  // remove click just because its DOM got replaced.
  let promoOpen = false

  function renderDrawer() {
    const body = document.getElementById('cart-drawer-body')
    const footer = document.getElementById('cart-drawer-footer')
    const shipping = document.getElementById('cart-drawer-shipping')
    const countEl = document.getElementById('cart-drawer-count')
    if (!body || !footer) return

    const count = getCartCount()
    if (countEl) countEl.textContent = count > 0 ? count : ''

    const cart = getCart()
    if (cart.items.length === 0) {
      body.innerHTML = '<div class="cart-drawer-empty">Your cart is empty.</div>'
      footer.innerHTML = ''
      if (shipping) shipping.innerHTML = ''
      return
    }

    if (shipping) shipping.innerHTML = shippingBarHtml()

    const mainItems = cart.items.filter(i => !FIRST_UNIT_FREE_BASE_PRICE[i.id])
    const perkItems = cart.items.filter(i => FIRST_UNIT_FREE_BASE_PRICE[i.id])

    let html = ''
    if (mainItems.length) {
      html += '<div class="cart-drawer-section-label">Your Items</div>'
      html += mainItems.map(drawerItemRowHtml).join('')
    }
    if (perkItems.length) {
      html += '<div class="cart-drawer-section-label">Free Gifts</div>'
      html += perkItems.map(drawerItemRowHtml).join('')
    }
    body.innerHTML = html

    footer.innerHTML =
      '<div class="cart-drawer-promo' + (promoOpen ? ' open' : '') + '" id="cart-drawer-promo">' +
        '<button type="button" class="cart-drawer-promo-toggle" id="cart-drawer-promo-toggle">' +
          '<span>Have a promo code?</span>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</button>' +
        '<div class="cart-drawer-promo-body">' +
          '<div class="cart-drawer-promo-body-inner">' +
            '<div class="cart-drawer-promo-row">' +
              '<input type="text" placeholder="Enter code" />' +
              '<button type="button">Apply</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="cart-drawer-subtotal">' +
        '<span>Total</span>' +
        '<span>' + formatMoney(getCartTotal()) + '</span>' +
      '</div>' +
      '<button type="button" class="cart-drawer-checkout-btn" id="cart-drawer-checkout-btn">Checkout</button>'

    document.getElementById('cart-drawer-promo-toggle').addEventListener('click', () => {
      promoOpen = !promoOpen
      document.getElementById('cart-drawer-promo').classList.toggle('open', promoOpen)
    })
    document.getElementById('cart-drawer-checkout-btn').addEventListener('click', () => {
      // Redirect to Shopify checkout when live
      // window.location.href = '/checkout'
      alert('Checkout will be available once our store is live. Thank you for your interest!')
    })
  }

  document.addEventListener('DOMContentLoaded', () => {
    const onCartPage = /(^|\/)cart\.html$/.test(location.pathname)
    document.querySelectorAll('.nav-cart-btn, .nav-cart-icon').forEach(el => {
      el.addEventListener('click', e => {
        if (onCartPage) return
        e.preventDefault()
        openDrawer()
      })
    })
  })

  // Keep an already-open drawer in sync if the cart changes from elsewhere
  // (e.g. localStorage updated in another tab).
  global.addEventListener('pilr:cart-updated', () => { if (isDrawerOpen()) renderDrawer() })

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
    formatMoney,
    getItemDisplay,
    openDrawer,
    closeDrawer,
  }
})(window)
