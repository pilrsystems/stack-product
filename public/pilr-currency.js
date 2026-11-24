// Country / currency picker + price conversion.
//  - asks /api/geo which country Cloudflare sees; that country's currency is the starting currency
//  - the header bar opens a popup where the shopper picks any country; their choice always wins over the detected one
//  - prices come from Shopify's own local prices for the country (/api/prices); the rates table is only the fallback
//  - exposes window.PilrCurrency (get / price / format / set / state) for the cart and the Build Your System page
(function (global) {
  var KEY = 'pilr_country'
  var state = { country: 'US', currency: 'USD', detected: 'US', rates: { USD: 1 }, countries: [], prices: {}, byCode: {} }

  function saved() { try { return localStorage.getItem(KEY) } catch (_) { return null } }
  function save(c) { try { localStorage.setItem(KEY, c) } catch (_) {} }

  // ── symbols / flags ─────────────────────────────────────────
  var symCache = {}
  function symbolFor(cur) {
    if (symCache[cur]) return symCache[cur]
    var s = cur
    try {
      var parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, currencyDisplay: 'symbol' }).formatToParts(0)
      for (var i = 0; i < parts.length; i++) if (parts[i].type === 'currency') s = parts[i].value
    } catch (_) {}
    return (symCache[cur] = s)
  }
  function flag(code) { return '<img class="cur-flag" src="https://flagcdn.com/w40/' + code.toLowerCase() + '.png" width="20" height="15" alt="" loading="lazy">' }
  function countryName(code) { var c = state.byCode[code]; return c ? c[1] : code }

  // ── prices ──────────────────────────────────────────────────
  // Same rounding as netlify/functions/currency.mjs (the checkout): whole units, USD keeps cents.
  function convert(usd, cur) {
    cur = cur || state.currency
    var rate = state.rates[cur]
    if (!rate || cur === 'USD') return usd
    return Math.round(usd * rate)
  }
  function fmt(n, cur) {
    var r = Math.round(n * 100) / 100
    return symbolFor(cur) + (Number.isInteger(r) ? r : r.toFixed(2))
  }
  function format(usd, cur) { cur = cur || state.currency; return fmt(convert(usd, cur), cur) }

  // Shopify's own local price for a product (what its checkout charges). Falls back to the rates table.
  // keys: 'pill-pod' 'hybrid-pod' 'powder-pod' 'classic-stack' 'scooper' 'lid'
  var USD_BASE = { 'pill-pod': 24, 'hybrid-pod': 28, 'powder-pod': 32, 'classic-stack': 68, scooper: 11, lid: 9 }
  function price(key) {
    if (state.currency === 'USD') return USD_BASE[key]
    var p = state.prices[state.country]
    if (p && p[key] != null) return p[key]
    return convert(USD_BASE[key], state.currency)
  }
  function podsTotal() { return price('pill-pod') + price('hybrid-pod') + price('powder-pod') }
  // A dollar amount found in page text -> the shopper's currency. A listed product price becomes Shopify's price
  // for it; any other amount (a discounted price, a saving) is scaled by the Full Stack's local/US ratio.
  function localizeUsd(v, hasCents) {
    if (state.currency === 'USD') return null
    var hit = null
    if (!hasCents) {
      if (v === 24) hit = price('pill-pod'); else if (v === 28) hit = price('hybrid-pod'); else if (v === 32) hit = price('powder-pod')
      else if (v === 11) hit = price('scooper'); else if (v === 9) hit = price('lid'); else if (v === 68) hit = price('classic-stack')
      else if (v === 84) hit = podsTotal(); else if (v === 16) hit = podsTotal() - price('classic-stack')
    }
    return fmt(hit != null ? hit : v * (price('classic-stack') / 68), state.currency)
  }

  // Walks the page's text and swaps "$32"-style amounts for the chosen currency (and back). Remembers each
  // node's original text so switching currency again always starts from the US price. Amounts the cart writes
  // itself ("CA$35") are left alone: a $ right after a letter is never converted.
  var AMOUNT = /(^|[^A-Za-z0-9])\$(\d[\d,]*)(\.\d{1,2})?/g
  var orig = new WeakMap(), lastOut = new WeakMap(), scanning = false
  function localizeNode(node) {
    var text = node.nodeValue
    var o = orig.has(node) && lastOut.get(node) === text ? orig.get(node) : text
    var out = o.replace(AMOUNT, function (m, pre, whole, cents) {
      var v = parseFloat(whole.replace(/,/g, '') + (cents || ''))
      if (v >= 1000) return m
      var local = localizeUsd(v, !!cents)
      return local == null ? m : pre + local
    })
    if (out !== o || orig.has(node)) { orig.set(node, o); lastOut.set(node, out) }
    if (out !== text) node.nodeValue = out
  }
  function localizePage(root) {
    if (scanning || !document.body) return
    scanning = true
    try {
      var w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var el = n.parentElement
          if (!el || /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(el.tagName) || el.closest('.cur-picker,.cur-modal,[data-no-currency]')) return NodeFilter.FILTER_REJECT
          return orig.has(n) || n.nodeValue.indexOf('$') !== -1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
        }
      })
      var n; while ((n = w.nextNode())) localizeNode(n)
    } finally { scanning = false }
  }
  var pending = false
  function scheduleLocalize() { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; localizePage() }) }
  function watchPage() {
    new MutationObserver(function () { if (!scanning) scheduleLocalize() })
      .observe(document.body, { childList: true, subtree: true, characterData: true })
  }

  // ── header bar ──────────────────────────────────────────────
  var bars = []
  function barHtml() {
    return flag(state.country) + '<span class="cur-full">' + countryName(state.country) + ' (' + state.currency + ' ' + symbolFor(state.currency) + ')</span>' +
      '<span class="cur-short">' + state.currency + '</span>' +
      '<svg class="cur-chev" viewBox="0 0 12 8" width="10" height="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l5 5 5-5"/></svg>'
  }
  function refreshBars() { bars.forEach(function (b) { b.innerHTML = barHtml() }) }
  function makeBar(extra) {
    var wrap = document.createElement('div')
    wrap.className = 'cur-picker cur-picker--bar ' + extra
    var btn = document.createElement('button')
    btn.type = 'button'; btn.className = 'cur-btn'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-label', 'Change country and currency')
    btn.addEventListener('click', openModal)
    wrap.appendChild(btn)
    bars.push(btn)
    return wrap
  }
  // Two copies, one shown per screen size (CSS): on web it sits in the social-icons row, above the payment icons;
  // on phones it sits under "© pilr 2026." in the bottom row.
  function mountBar() {
    if (bars.length) return
    var social = document.querySelector('.site-footer-social-inner')
    if (social) social.appendChild(makeBar('cur-picker--web'))
    var copy = document.querySelector('.site-footer-copy')
    if (copy) copy.parentNode.insertBefore(makeBar('cur-picker--phone'), copy.nextSibling)
    refreshBars()
  }

  // ── popup ───────────────────────────────────────────────────
  var modal = null, pendingCountry = null
  function buildModal() {
    if (modal) return
    modal = document.createElement('div')
    modal.className = 'cur-modal'
    modal.innerHTML =
      '<div class="cur-modal-card" role="dialog" aria-modal="true" aria-labelledby="cur-modal-title">' +
        '<button type="button" class="cur-modal-x" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '<h2 class="cur-modal-title" id="cur-modal-title"></h2>' +
        '<p class="cur-modal-label">Country / Region</p>' +
        '<div class="cur-select">' +
          '<button type="button" class="cur-select-btn" aria-haspopup="listbox" aria-expanded="false"><span class="cur-select-value"></span>' +
            '<svg class="cur-chev" viewBox="0 0 12 8" width="12" height="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l5 5 5-5"/></svg></button>' +
          '<div class="cur-select-panel"><input type="text" class="cur-search" placeholder="Search for a country..." autocomplete="off" aria-label="Search for a country"><ul class="cur-list" role="listbox"></ul></div>' +
        '</div>' +
        '<button type="button" class="cur-modal-primary">Change country</button>' +
        '<button type="button" class="cur-modal-secondary">Close</button>' +
      '</div>'
    document.body.appendChild(modal)
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal() })
    modal.querySelector('.cur-modal-x').addEventListener('click', closeModal)
    modal.querySelector('.cur-modal-secondary').addEventListener('click', closeModal)
    modal.querySelector('.cur-modal-primary').addEventListener('click', function () { if (pendingCountry) setCountry(pendingCountry, true); closeModal() })
    var sel = modal.querySelector('.cur-select')
    sel.querySelector('.cur-select-btn').addEventListener('click', function () { toggleSelect(!sel.classList.contains('open')) })
    modal.querySelector('.cur-search').addEventListener('input', function () { renderList(this.value) })
    modal.querySelector('.cur-list').addEventListener('click', function (e) {
      var li = e.target.closest('li[data-code]'); if (!li) return
      pendingCountry = li.dataset.code; showPending(); toggleSelect(false)
    })
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal() })
  }
  function curOf(code) { var c = state.byCode[code]; return c ? c[2] : 'USD' }
  function optLabel(code) { return countryName(code) + ' (' + curOf(code) + ' ' + symbolFor(curOf(code)) + ')' }
  function showPending() {
    modal.querySelector('.cur-select-value').innerHTML = flag(pendingCountry) + '<span>' + optLabel(pendingCountry) + '</span>'
  }
  function renderList(q) {
    q = (q || '').toLowerCase().trim()
    var html = state.countries.filter(function (c) { return !q || c[1].toLowerCase().indexOf(q) !== -1 || c[2].toLowerCase().indexOf(q) !== -1 })
      .map(function (c) {
        return '<li role="option" data-code="' + c[0] + '" aria-selected="' + (c[0] === pendingCountry) + '">' + flag(c[0]) + '<span>' + c[1] + ' (' + c[2] + ' ' + symbolFor(c[2]) + ')</span></li>'
      }).join('')
    modal.querySelector('.cur-list').innerHTML = html || '<li class="cur-none">No match</li>'
  }
  function toggleSelect(open) {
    var sel = modal.querySelector('.cur-select')
    sel.classList.toggle('open', open)
    sel.querySelector('.cur-select-btn').setAttribute('aria-expanded', open ? 'true' : 'false')
    if (open) {
      var s = modal.querySelector('.cur-search'); s.value = ''; renderList('')
      var cur = modal.querySelector('.cur-list li[aria-selected="true"]'); if (cur) cur.scrollIntoView({ block: 'center' })
      s.focus()
    }
  }
  function openModal() {
    if (!state.countries.length) return
    buildModal()
    pendingCountry = state.country
    modal.querySelector('.cur-modal-title').textContent = "You're shopping in " + countryName(state.country)
    showPending(); toggleSelect(false)
    modal.classList.add('open')
    document.documentElement.classList.add('cur-modal-open')
  }
  function closeModal() {
    if (!modal) return
    modal.classList.remove('open')
    document.documentElement.classList.remove('cur-modal-open')
  }

  // ── choosing a country ──────────────────────────────────────
  function fetchPrices(code) {
    if (state.currency === 'USD' || state.prices[code]) return
    fetch('/api/prices?country=' + encodeURIComponent(code)).then(function (r) { return r.ok ? r.json() : null }).then(function (d) {
      if (!d || !d.prices) return
      state.prices[code] = d.prices
      if (code === state.country) { localizePage(); global.dispatchEvent(new CustomEvent('pilr:currency-changed', { detail: { currency: state.currency, prices: true } })) }
    }).catch(function () {})
  }
  function setCountry(code, fromUser) {
    if (!state.byCode[code]) return
    var changed = code !== state.country
    state.country = code
    state.currency = curOf(code)
    if (fromUser) save(code)
    refreshBars()
    document.documentElement.classList.toggle('cur-intl', state.currency !== 'USD')
    localizePage()
    fetchPrices(code)
    if (changed || fromUser) global.dispatchEvent(new CustomEvent('pilr:currency-changed', { detail: { currency: state.currency } }))
  }

  function init() {
    var chosen = saved()
    fetch('/api/geo').then(function (r) { return r.ok ? r.json() : null }).catch(function () { return null }).then(function (d) {
      if (d && d.rates && d.countries) {
        state.rates = d.rates; state.countries = d.countries; state.detected = d.country
        d.countries.forEach(function (c) { state.byCode[c[0]] = c })
      }
      if (!state.countries.length) { state.countries = [['US', 'United States', 'USD']]; state.byCode.US = state.countries[0] }
      mountBar()
      // a country the shopper picked before wins; otherwise the one Cloudflare sees (US if it isn't in our list)
      var start = chosen && state.byCode[chosen] ? chosen : (state.byCode[state.detected] ? state.detected : 'US')
      setCountry(start, false)
      global.dispatchEvent(new CustomEvent('pilr:currency-ready'))
      watchPage()
    })
  }

  global.PilrCurrency = {
    convert: convert, format: format, fmt: function (n) { return fmt(n, state.currency) }, price: price,
    set: function (code) { setCountry(code, true) },
    get: function () { return state.currency },
    country: function () { return state.country },
    state: state,
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init()
})(window)
