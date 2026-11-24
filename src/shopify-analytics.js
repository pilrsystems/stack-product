/* ─────────────────────────────────────────────
   Gate for Shopify analytics (hidden flag).

   Does NOTHING unless the URL has ?shopify-analytics=1. The flag is remembered in sessionStorage for
   that browser tab only. ?shopify-analytics=0 turns it off again. Only when the flag is on is the real
   code (shopify-analytics-run.js, and Shopify's analytics library with it) downloaded.
   Normal visitors: no library, no requests, no cookies, no banner.
──────────────────────────────────────────────── */
const KEY = 'shopify-analytics'
let on = false
try {
  const q = new URLSearchParams(location.search).get(KEY)
  if (q === '1') sessionStorage.setItem(KEY, '1')
  else if (q === '0') sessionStorage.removeItem(KEY)
  on = sessionStorage.getItem(KEY) === '1'
} catch (_) { /* storage blocked: flag stays off */ }

if (on) import('./shopify-analytics-run.js')
