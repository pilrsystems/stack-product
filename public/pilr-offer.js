/* Black Friday button (partials/black-friday-button.html), shared by the product pages.
   PilrOffer(wanted): `wanted()` returns what the page's Pre-order button would add right now, as
   [{ product, quantity }]. A click applies FIRST1000 and adds whatever of that is not in the cart yet.
   `title()` returns { el, now, list }: the page's price at the top, its amount, and its undiscounted amount.
   While the button shows "Unlocked", that price is replaced by the discounted one, the undiscounted one crossed
   out, and a 'You saved' tag with the difference.
   `buttons()` lists the page's Pre-order buttons as [{ el, list }]. A button reads "Added to cart", and
   keeps reading it, while everything in `list` is in the cart. Every click opens the cart; none doubles an item. */
;(function (global) {
  var CODE = 'FIRST1000'

  function money(n) { return '$' + (Number.isInteger(n) ? n : n.toFixed(2)) }   // US dollars; pilr-currency.js converts the page text
  function cents(n) { return Math.round(n * 100) / 100 }

  var ADDED = 'ADDED TO CART'

  global.PilrOffer = function (wanted, title, buttons) {
    var btn = document.getElementById('bf-offer-btn')
    var msg = document.getElementById('bf-offer-msg')
    var text = msg.textContent

    function applied() {
      var promo = PilrCart.getPromo()
      return !!promo && String(promo.code).toUpperCase() === CODE
    }
    // The part of `list` the cart does not hold yet, so nothing is ever doubled.
    function missing(list) {
      var items = PilrCart.get().items
      return list.map(function (w) {
        var have = items.reduce(function (n, i) { return n + (i.id === w.product.id ? i.quantity : 0) }, 0)
        return { product: w.product, quantity: Math.max(0, w.quantity - have) }
      }).filter(function (w) { return w.quantity > 0 })
    }
    function addMissing(list) {
      var rest = missing(list)
      rest.forEach(function (w) { PilrCart.add(w.product, w.quantity) })
      return rest.length
    }
    var priceBox = null
    // Where the text baseline of `el` sits on screen.
    function baseline(el) {
      var mark = document.createElement('span')
      mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
      el.insertBefore(mark, el.firstChild)
      var y = mark.getBoundingClientRect().bottom
      el.removeChild(mark)
      return y
    }
    // Lay the new price exactly over the old one (same right edge, same baseline). The old price stays in
    // place, invisible, and the new one is out of the page flow, so nothing on the page moves.
    function place(oldEl) {
      var parent = priceBox.parentNode
      parent.style.position = 'relative'
      var p = parent.getBoundingClientRect(), o = oldEl.getBoundingClientRect()
      priceBox.style.right = (p.right - o.right) + 'px'
      priceBox.style.top = (o.top - p.top) + 'px'
      var oldText = oldEl.querySelector('b') || oldEl
      var shift = baseline(oldText) - baseline(priceBox.querySelector('b'))
      priceBox.style.top = (o.top - p.top + shift) + 'px'
    }
    function showPrice(unlocked) {
      var t = title && title()
      if (!t || !t.el) return
      var on = unlocked && t.now > 0
      if (!priceBox) {
        priceBox = document.createElement('span')
        priceBox.className = 'bf-price'
        priceBox.setAttribute('aria-live', 'polite')
        t.el.parentNode.insertBefore(priceBox, t.el.nextSibling)
      }
      t.el.classList.toggle('bf-price-replaced', on)
      priceBox.hidden = !on
      if (!on) { priceBox.textContent = ''; return }
      var now = cents(t.now * (1 - PilrCart.getPromo().percent / 100))
      var list = cents(Math.max(t.list, t.now))
      priceBox.innerHTML = '<span class="bf-price-line"><b>' + money(now) + '</b><s>' + money(list) + '</s></span>' +
        '<span class="bf-price-save">You saved ' + money(cents(list - now)) + '</span>'
      // the new price follows the price it replaces (weight, colour, and size) on this page and screen
      var old = getComputedStyle(t.el.querySelector('b') || t.el)
      var b = priceBox.querySelector('b')
      b.style.fontSize = (parseFloat(old.fontSize) * 0.85).toFixed(1) + 'px'   // a little smaller: the longer amount (with cents) looks bigger at the same size
      b.style.fontWeight = old.fontWeight
      b.style.color = old.color
      b.style.fontFamily = old.fontFamily
      b.style.letterSpacing = old.letterSpacing
      // a crossed-out price that was already showing keeps its own size
      var struck = t.el.querySelector('.bc-price-strike, .pod-add-row-strike, s')
      if (struck && !struck.hidden) {
        var was = getComputedStyle(struck)
        priceBox.querySelector('s').style.fontSize = was.fontSize
        priceBox.querySelector('s').style.letterSpacing = was.letterSpacing
      }
      place(t.el)
    }
    function showAdded() {
      ;(buttons ? buttons() : []).forEach(function (b) {
        if (!b.el) return
        var added = b.list.length > 0 && missing(b.list).length === 0
        if (added && b.el.textContent !== ADDED) {
          b.el.dataset.label = b.el.innerHTML
          b.el.textContent = ADDED
        } else if (!added && b.el.textContent === ADDED) {
          b.el.innerHTML = b.el.dataset.label
        }
      })
    }
    // "Unlocked" whenever the code is applied, on every product page, whatever is selected.
    function sync() {
      var on = applied()
      btn.classList.toggle('is-unlocked', on)
      btn.disabled = on
      if (on || wanted().length) msg.textContent = msg.textContent === 'Choose a pod first' ? text : msg.textContent
      showPrice(on)
      showAdded()
    }

    btn.addEventListener('click', async function () {
      // The code only stays on a cart with something in it (Build Your System with nothing picked yet).
      if (!wanted().length && !PilrCart.get().items.length) { msg.textContent = 'Choose a pod first'; return }
      btn.disabled = true
      msg.textContent = text
      var error = await PilrCart.applyPromo(CODE)
      if (!error) addMissing(wanted())
      sync()
      if (error) msg.textContent = error
    })
    global.addEventListener('pilr:cart-updated', sync)
    global.addEventListener('storage', sync)
    global.addEventListener('pageshow', sync)
    // the old price changes size with the screen; keep the new one matching it
    function redraw() { showPrice(btn.classList.contains('is-unlocked')) }
    global.addEventListener('resize', redraw)
    global.addEventListener('load', redraw)
    if (document.fonts) document.fonts.ready.then(redraw)
    var shownTitle = title && title()
    if (shownTitle && shownTitle.el && global.ResizeObserver) new ResizeObserver(redraw).observe(shownTitle.el.parentNode)
    sync()

    return {
      sync: sync,
      // For the Pre-order buttons: add only what the cart does not hold yet, then open the cart.
      preorder: function (list) {
        addMissing(list)
        PilrCart.openDrawer()
      },
    }
  }
})(window)
