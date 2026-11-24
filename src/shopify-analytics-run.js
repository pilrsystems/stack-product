/* ─────────────────────────────────────────────
   Shopify analytics for the headless storefront. The real work; loaded ONLY by src/shopify-analytics.js,
   which gates it behind the hidden ?shopify-analytics=1 flag.

   - Loads Shopify's Customer Privacy API and asks IT whether analytics is allowed. Consent is never
     hardcoded: where the visitor's region needs consent and none is stored, nothing is sent.
   - PAGE_VIEW on every page load and every URL change; ADD_TO_CART after a successful add.
   - Cookies come from the same-origin proxy /api/unstable/graphql.json (backend-managed;
     this file never creates or rotates _shopify_y / _shopify_s).
   - Never runs for a normal visitor: the gate in src/shopify-analytics.js only imports this file when the flag is on.
──────────────────────────────────────────────── */
import { sendShopifyAnalytics, getClientBrowserParameters } from '@shopify/hydrogen-react/analytics'

const SHOP_ID = 'gid://shopify/Shop/81822679265'
const CHECKOUT_DOMAIN = 'checkout.pilrsystems.com'
const STOREFRONT_TOKEN = '9396df79576b2d44b767b40cdd0ebe8d' // public Storefront token (same as src/shopify.js)
const CONSENT_SCRIPT = 'https://cdn.shopify.com/shopifycloud/consent-tracking-api/v0.1/consent-tracking-api.js'

// Site cart ids -> Shopify products/variants (same variants as netlify/functions/create-checkout.mjs).
const PRODUCTS = {
  'pill-pod':       { p: '10454927868129', v: '51750564724961', name: 'Small Pill Pod', sku: 'SMALL-PILL-POD' },
  'hybrid-pod':     { p: '10454921150689', v: '51750542541025', name: 'Large Pill Pod', sku: 'LARGE-PILL-POD' },
  'powder-pod':     { p: '10454912467169', v: '51750522618081', name: 'Powder Pod', sku: 'POWDER-POD' },
  'travel-scooper': { p: '10454938910945', v: '51750588547297', name: 'Travel Scooper', sku: 'TRAVEL-SCOOPER' },
  'single-lid':     { p: '10454944743649', v: '51750601097441', name: 'Single Lid', sku: 'SINGLE-LID' },
}

function loadConsentApi() {
  return new Promise((resolve) => {
    if (window.Shopify && window.Shopify.customerPrivacy) return resolve(window.Shopify.customerPrivacy)
    const s = document.createElement('script')
    s.src = CONSENT_SCRIPT
    s.async = true
    s.onload = () => resolve(window.Shopify && window.Shopify.customerPrivacy)
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
}

// Config-only call: records NO consent. It makes Shopify set up the visitor's cookies (through our proxy) and detect their region.
function initConsent(cp) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    try {
      cp.setTrackingConsent({
        headlessStorefront: true,
        checkoutRootDomain: location.host, // same origin => our /api/unstable/graphql.json proxy
        storefrontRootDomain: location.hostname,
        storefrontAccessToken: STOREFRONT_TOKEN,
      }, finish)
    } catch (_) { finish() }
    setTimeout(finish, 4000)
  })
}

const state = { cp: null, ready: false }

function privacyPayload() {
  const cp = state.cp
  const call = (name) => { try { return !!cp[name]() } catch (_) { return false } }
  let region = ''
  try { region = cp.getRegion() } catch (_) {}
  return {
    hasUserConsent: call('analyticsProcessingAllowed'), // asked, never assumed
    analyticsAllowed: call('analyticsProcessingAllowed'),
    marketingAllowed: call('marketingAllowed'),
    saleOfDataAllowed: call('saleOfDataAllowed'),
    ccpaEnforced: false,
    gdprEnforced: false,
    _region: region,
  }
}

function base() {
  const { _region, ...privacy } = privacyPayload()
  return { ...getClientBrowserParameters(), shopId: SHOP_ID, shopifySalesChannel: 'headless', currency: 'USD', acceptedLanguage: 'EN', ...privacy }
}

function pageInfo() {
  const p = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/'
  const slug = { '/full-stack': 'classic-stack', '/small-pill-pod': 'pill-pod', '/large-pill-pod': 'hybrid-pod', '/powder-pod': 'powder-pod', '/single-lid': 'single-lid', '/travel-scooper': 'travel-scooper' }[p]
  if (slug && PRODUCTS[slug]) return { pageType: 'product', resourceId: `gid://shopify/Product/${PRODUCTS[slug].p}` }
  return { pageType: p === '/' ? 'index' : p === '/cart' ? 'cart' : 'page' }
}

let lastUrl = ''
function sendPageView() {
  if (!state.ready) return
  const url = location.pathname + location.search
  if (url === lastUrl) return // once per URL
  lastUrl = url
  sendShopifyAnalytics({ eventName: 'PAGE_VIEW', payload: { ...base(), ...pageInfo() } }, CHECKOUT_DOMAIN)
}

function sendAddToCart(detail) {
  if (!state.ready || !detail || !detail.product) return
  const { product, quantity } = detail
  const m = PRODUCTS[product.id]
  const price = Number(product.price) || 0
  const q = Number(quantity) || 1
  sendShopifyAnalytics({
    eventName: 'ADD_TO_CART',
    payload: {
      ...base(),
      cartId: '',
      totalValue: price * q,
      products: [{
        productGid: m ? `gid://shopify/Product/${m.p}` : undefined,
        variantGid: m ? `gid://shopify/ProductVariant/${m.v}` : undefined,
        name: m ? m.name : product.title,
        variantName: 'Default Title',
        brand: 'pilr',
        category: '',
        sku: m ? m.sku : String(product.id),
        price: String(price),
        quantity: q,
      }],
    },
  }, CHECKOUT_DOMAIN)
}

// Consent banner: only where Shopify says this visitor's region needs one.
function maybeShowBanner() {
  let need = false
  try { need = !!state.cp.shouldShowBanner() } catch (_) {}
  if (!need || document.getElementById('pilr-consent')) return
  const bar = document.createElement('div')
  bar.id = 'pilr-consent'
  bar.setAttribute('role', 'dialog')
  bar.setAttribute('aria-label', 'Cookie preferences')
  bar.innerHTML = '<p>We use cookies to understand how pilr is used. Accept to help us improve it, or decline to continue without.</p>' +
    '<div><button type="button" data-c="no">Decline</button><button type="button" data-c="yes">Accept</button></div>'
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]')
    if (!b) return
    const yes = b.dataset.c === 'yes'
    state.cp.setTrackingConsent({ analytics: yes, marketing: yes, preferences: yes, sale_of_data: false,
      headlessStorefront: true, checkoutRootDomain: location.host, storefrontRootDomain: location.hostname, storefrontAccessToken: STOREFRONT_TOKEN }, () => {
      bar.remove()
      lastUrl = '' // the choice was just made: count this page now if analytics is allowed
      sendPageView()
    })
  })
  document.body.appendChild(bar)
}

async function start() {
  const cp = await loadConsentApi()
  if (!cp) return
  state.cp = cp
  await initConsent(cp)
  state.ready = true
  window.__pilrShopify = { privacy: () => ({ ...privacyPayload(), banner: (() => { try { return !!cp.shouldShowBanner() } catch (_) { return null } })() }) } // for testing in the console
  maybeShowBanner()
  sendPageView()
}

// Client-side navigation (history API) counts as a page view too.
;['pushState', 'replaceState'].forEach((fn) => {
  const orig = history[fn]
  history[fn] = function () { const r = orig.apply(this, arguments); setTimeout(sendPageView, 0); return r }
})
window.addEventListener('popstate', () => setTimeout(sendPageView, 0))
window.addEventListener('pilr:added-to-cart', (e) => sendAddToCart(e.detail))

start()
