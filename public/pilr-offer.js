/* Black Friday button (partials/black-friday-button.html), shared by the product pages.
   PilrOffer(wanted): `wanted()` returns what the page's Pre-order button would add right now, as
   [{ product, quantity }]. A click applies FIRST1000 and adds whatever of that is not in the cart yet. */
;(function (global) {
  var CODE = 'FIRST1000'

  global.PilrOffer = function (wanted) {
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
    // "Unlocked" while the code is applied and the selection is in the cart.
    function sync() {
      var on = applied() && missing(wanted()).length === 0
      btn.classList.toggle('is-unlocked', on)
      btn.disabled = on
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
