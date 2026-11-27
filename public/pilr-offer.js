/* Black Friday button (partials/black-friday-button.html), shared by the product pages.
   PilrOffer(wanted): `wanted()` returns what the page's Pre-order button would add right now, as
   [{ product, quantity }]. A click applies FIRST1000 and adds whatever of that is not in the cart yet.
   `title()` returns { el, now, list }: the page's price at the top, its amount, and its undiscounted amount.
   While the button shows "Unlocked", that price is replaced by the discounted one, the undiscounted one crossed
   out, and a 'You saved' tag with the difference. */
;(function (global) {
  var CODE = 'FIRST1000'

  function money(n) { return '$' + (Number.isInteger(n) ? n : n.toFixed(2)) }   // US dollars; pilr-currency.js converts the page text
  function cents(n) { return Math.round(n * 100) / 100 }

  global.PilrOffer = function (wanted, title) {
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
      // the new price looks exactly like the price it replaces (size, weight, colour) on this page and screen
      var old = getComputedStyle(t.el.querySelector('b') || t.el)
      var b = priceBox.querySelector('b')
      b.style.fontSize = old.fontSize
      b.style.fontWeight = old.fontWeight
      b.style.color = old.color
      b.style.fontFamily = old.fontFamily
      b.style.letterSpacing = old.letterSpacing
    }
    // "Unlocked" while the code is applied and the selection is in the cart.
    function sync() {
      var on = applied() && missing(wanted()).length === 0
      btn.classList.toggle('is-unlocked', on)
      btn.disabled = on
      showPrice(on)
    }

    btn.addEventListener('click', async function () {
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
    global.addEventListener('resize', function () { showPrice(btn.classList.contains('is-unlocked')) })
    sync()

    return {
      sync: sync,
      // For the Pre-order buttons. With the code applied: add only what is missing, or just open the cart.
      // Returns false when the code is not applied, so the button behaves as usual.
      preorder: function (list) {
        if (!applied()) return false
        if (!addMissing(list)) PilrCart.openDrawer()
        return true
      },
    }
  }
})(window)
