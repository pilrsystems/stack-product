/* ─────────────────────────────────────────────
   POST /api/checkout  (Netlify Function, ESM/v2 format)

   Turns the site cart into a Shopify DRAFT ORDER and returns the Shopify payment
   page for it:  { "url": "https://…/invoices/…" }

   The browser only sends WHAT is in the cart ({ items: [{ id, quantity }] }).
   Every price is worked out here, from the same rules the site cart uses, so a
   tampered browser cart cannot lower a price.

   Pricing rules (keep in step with public/pilr-cart.js):
     - Pods (Small Pill, Large Pill, Powder): tier discount on the loose pods by
       combined count: 2 = 10%, 3 = 15%, 4 = 20%, 5 = 25%, 6+ = 28%.
       A Full Stack counts as 3 pods toward the tier; the Full Stack itself is $68.
     - Full Stack = one of each pod for $68 (sent to Shopify as three pod lines so
       each pod's stock goes down by 1).
     - One free Travel Scooper per cart when it has a Powder Pod or a Full Stack.
     - Free Single Lids: one per Full Stack plus one for every 3 single pods
       (1-3 singles = 1, 4-6 = 2; Full Stack + 1 single = 2).
     - Free shipping on every order.

   SWITCHED OFF by default: set CHECKOUT_ENABLED=true in Netlify to turn it on.
   While it is off the endpoint answers 503 and the site keeps showing its
   "checkout will be available soon" message.

   Needs: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET (same as
   claim-review.mjs) and the write_draft_orders scope on the Shopify app.

   STATUS: written but NOT yet tested against the live store.
──────────────────────────────────────────────── */

// Settings come from Netlify's process.env, or from Cloudflare's env (set by functions/api/*.js).
const ENV = () => globalThis.__ENV || (typeof process !== 'undefined' && process.env ? process.env : {})

import { countOrders } from './preorder-count.mjs'
import { RATES, currencyForCountry, isKnownCountry } from './currency.mjs'

const ADMIN_API_VERSION = '2024-10'
const TOKEN_REFRESH_BUFFER_MS = 60_000

// Shopify variant IDs (numeric) for each product.
const VARIANT_ID = {
  'pill-pod':   '51750564724961',  // Small Pill Pod
  'hybrid-pod': '51750542541025',  // Large Pill Pod
  'powder-pod': '51750522618081',  // Powder Pod
  scooper:      '51750588547297',  // Travel Scooper
  lid:          '51750601097441',  // Single Lid
}
const POD_PRICE = { 'pill-pod': 24, 'hybrid-pod': 28, 'powder-pod': 32 }
const POD_TITLE = { 'pill-pod': 'Small Pill Pod', 'hybrid-pod': 'Large Pill Pod', 'powder-pod': 'Powder Pod' }
const SCOOPER_PRICE = 11
const LID_PRICE = 9
const FULL_STACK_PRICE = 68
// $16 off a Full Stack, split across its three pods so it sums exactly: Small 24 -> 19.43, Large 28 -> 22.67, Powder 32 -> 25.90
// (The "Free shipping · Estimated ship date Jan. 25" name now lives on the free US shipping rate in Shopify's shipping settings, not here.)
const FULL_STACK_DISCOUNT = { 'pill-pod': 4.57, 'hybrid-pod': 5.33, 'powder-pod': 6.10 }
const TIER_DISCOUNT = [0, 0, 0.10, 0.15, 0.20, 0.25, 0.28]  // by total pods, 6+ capped

let cachedToken = null
let cachedTokenExpiresAt = 0

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ENV().SITE_ORIGIN || '*',
    },
  })
}

async function getAccessToken(domain) {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) return cachedToken
  const clientId = ENV().SHOPIFY_CLIENT_ID
  const clientSecret = ENV().SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Shopify Admin API is not configured')
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  })
  const raw = await res.text()
  let payload = {}
  try { payload = JSON.parse(raw) } catch (_) { /* not JSON */ }
  if (!res.ok || !payload.access_token) throw new Error('Shopify token exchange failed: HTTP ' + res.status + ' ' + raw.replace(/\s+/g, ' ').slice(0, 160))
  cachedToken = payload.access_token
  cachedTokenExpiresAt = Date.now() + payload.expires_in * 1000
  return cachedToken
}

// Reads { items: [{ id, quantity }] } and returns total quantity per product id.
// Free-perk ids ('travel-scooper-free', 'single-lid-free') count as the plain product.
export function normaliseCart(body) {
  const qty = { 'classic-stack': 0, 'pill-pod': 0, 'hybrid-pod': 0, 'powder-pod': 0, scooper: 0, lid: 0 }
  const items = body && Array.isArray(body.items) ? body.items : []
  for (const it of items) {
    const n = Math.floor(Number(it && it.quantity))
    if (!Number.isFinite(n) || n < 1 || n > 99) continue
    const id = String(it.id)
    if (id === 'classic-stack' || id === 'pill-pod' || id === 'hybrid-pod' || id === 'powder-pod') qty[id] += n
    else if (id === 'travel-scooper' || id === 'travel-scooper-free') qty.scooper += n
    else if (id === 'single-lid' || id === 'single-lid-free') qty.lid += n
  }
  return qty
}

// Builds the Shopify draft-order line items from the cart quantities.
// Each line: { variantId (gid), quantity, appliedDiscount?, customAttributes? }
export function buildLines(qty) {
  const gid = (key) => `gid://shopify/ProductVariant/${VARIANT_ID[key]}`
  const lines = []
  const stacks = qty['classic-stack']
  const loose = qty['pill-pod'] + qty['hybrid-pod'] + qty['powder-pod']
  if (stacks + loose === 0 && qty.scooper + qty.lid === 0) return lines

  // Full Stacks: one of each pod for $68.
  // If FULL_STACK_BUNDLE_VARIANT is set (the numeric variant ID of the Full Stack bundle product in Shopify),
  // each Full Stack is ONE line at the bundle's own $68 price, which shows as "Full Stack" in checkout.
  // Otherwise it is sent as three pod lines with exact dollar-amount discounts that add up to $16.00
  // (4.57 + 5.33 + 6.10), so each Full Stack is exactly $68.00. One set per Full Stack keeps it exact.
  const bundleVariant = String(ENV().FULL_STACK_BUNDLE_VARIANT || '').trim()
  if (stacks > 0 && /^\d+$/.test(bundleVariant)) {
    lines.push({ variantId: `gid://shopify/ProductVariant/${bundleVariant}`, quantity: stacks })
  } else {
    for (let n = 0; n < stacks; n++) {
      for (const id of ['pill-pod', 'hybrid-pod', 'powder-pod']) {
        lines.push({
          variantId: gid(id),
          quantity: 1,
          appliedDiscount: { title: 'Full Stack', valueType: 'FIXED_AMOUNT', value: FULL_STACK_DISCOUNT[id] },
          customAttributes: [{ key: '_bundle', value: 'full-stack' }],   // the leading _ hides it from the customer
        })
      }
    }
  }

  // Loose pods: tier by combined count (a Full Stack counts as 3).
  if (loose > 0) {
    const tierQty = loose + 3 * stacks
    const d = TIER_DISCOUNT[Math.min(tierQty, 6)]
    for (const id of ['pill-pod', 'hybrid-pod', 'powder-pod']) {
      if (!qty[id]) continue
      const line = { variantId: gid(id), quantity: qty[id] }
      if (d > 0) line.appliedDiscount = { title: `${Math.round(d * 100)}% off ${tierQty} pods`, valueType: 'PERCENTAGE', value: Number((d * 100).toFixed(4)) }
      lines.push(line)
    }
  }

  const hasPod = loose + stacks > 0
  const free = (key, units, title) => ({
    variantId: gid(key),
    quantity: units,
    appliedDiscount: { title, valueType: 'PERCENTAGE', value: 100 },
  })

  // Travel Scooper: one free per cart with a Powder Pod or a Full Stack; the rest at full price.
  if (qty.scooper > 0) {
    const freeUnits = (qty['powder-pod'] > 0 || stacks > 0) ? 1 : 0
    if (freeUnits) lines.push(free('scooper', 1, 'Free Travel Scooper'))
    if (qty.scooper - freeUnits > 0) lines.push({ variantId: gid('scooper'), quantity: qty.scooper - freeUnits })
  }

  // Single Lid: one per Full Stack, plus one for every 3 single pods.
  if (qty.lid > 0) {
    const allowance = hasPod ? stacks + Math.ceil(loose / 3) : 0
    const freeUnits = Math.min(qty.lid, allowance)
    if (freeUnits) lines.push(free('lid', freeUnits, 'Free Single Lid'))
    if (qty.lid - freeUnits > 0) lines.push({ variantId: gid('lid'), quantity: qty.lid - freeUnits })
  }

  return lines
}

// Promo codes. Shopify does not let a customer type a code on a draft order's payment page, so the
// code is checked here and sent to Shopify as a discount on the whole order. It comes off AFTER all the
// other pricing above (pod tiers, the Full Stack price), so it stacks on top of them.
// FIRST1000: 20% off the whole order, for the first 1,000 orders (the same count as the pre-order counter).
// "One use per customer" is not enforced yet: this code never sees who the customer is.
const PROMOS = { FIRST1000: { percent: 20 } }

export async function checkPromo(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase()
  const promo = PROMOS[code]
  if (!promo) return { valid: false, message: 'That code is not valid.' }
  try {
    const claimed = await countOrders()
    const goal = Number(ENV().PREORDER_GOAL) || 1000
    if (claimed >= goal) return { valid: false, message: 'Sorry, this code has reached its limit.' }
  } catch (err) {
    console.error('promo: could not count orders, allowing the code', err && err.message)
  }
  return { valid: true, code, percent: promo.percent }
}

// Shopify's own local prices (what its checkout will charge) for ONE country, for the site to show.
// Returns { currency: 'CAD', prices: { 'pill-pod': 35, ..., 'classic-stack': 99 } } or throws.
export async function getLocalPrices(country) {
  const cc = String(country || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) throw new Error('bad country')
  const domain = ENV().SHOPIFY_STORE_DOMAIN
  if (!domain) throw new Error('missing SHOPIFY_STORE_DOMAIN')
  const token = await getAccessToken(domain)
  const ids = { ...VARIANT_ID }
  const bundle = String(ENV().FULL_STACK_BUNDLE_VARIANT || '').trim()
  if (/^\d+$/.test(bundle)) ids['classic-stack'] = bundle
  const fields = Object.entries(ids).map(([key, vid]) =>
    `${key.replace(/-/g, '_')}: productVariant(id: "gid://shopify/ProductVariant/${vid}") { contextualPricing(context: { country: ${cc} }) { price { amount currencyCode } } }`)
  const res = await fetch(`https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: `{ ${fields.join('\n')} }` }),
  })
  const payload = await res.json()
  if (!res.ok || payload.errors) throw new Error('prices failed: ' + JSON.stringify(payload.errors || {}).slice(0, 300))
  const prices = {}
  let currency = null
  for (const [alias, v] of Object.entries(payload.data || {})) {
    const cp = v && v.contextualPricing && v.contextualPricing.price
    if (!cp) continue
    currency = currency || cp.currencyCode
    prices[alias.replace(/_/g, '-')] = Number(cp.amount)
  }
  if (!currency) throw new Error('no prices for ' + cc)
  return { currency, prices }
}

export default async (req) => {
  if (ENV().CHECKOUT_ENABLED !== 'true') return json(503, { error: 'checkout not enabled' })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  let body
  try { body = await req.json() } catch (_) { return json(400, { error: 'bad request' }) }
  const lineItems = buildLines(normaliseCart(body))
  if (!lineItems.length) return json(400, { error: 'empty cart' })

  // Shopper's currency / country (from the site's currency picker). Anything unknown falls back to US dollars.
  const currency = body && RATES[body.currency] && body.currency !== 'USD' ? body.currency : null
  const marketCountry = currency && /^[A-Za-z]{2}$/.test(String(body.country || '')) ? String(body.country).toUpperCase() : null
  // The checkout opens with the country already selected, for US orders only. Shopify refuses a country-only address
  // on a Managed Markets (non-US) order ("Add customer's email, shipping phone number, and shipping address"), so other countries are not sent.
  const addressCountry = body && String(body.country).toUpperCase() === 'US' ? 'US' : null

  let promo = null
  if (body && body.code) {
    promo = await checkPromo(body.code)
    if (!promo.valid) return json(400, { error: 'promo invalid', message: promo.message })
  }

  try {
    const domain = ENV().SHOPIFY_STORE_DOMAIN
    if (!domain) throw new Error('missing SHOPIFY_STORE_DOMAIN')
    const token = await getAccessToken(domain)
    // Price every line at Shopify's own market price for the shopper's country, so the first checkout screen already shows
    // the same amounts as the site (without this Shopify converts USD at a plain rate, then reprices once an address is entered).
    let overrides = null
    if (marketCountry) {
      try {
        const local = await getLocalPrices(marketCountry)
        if (local.currency === currency) {
          const keyOf = {}
          for (const [k, v] of Object.entries(VARIANT_ID)) keyOf[`gid://shopify/ProductVariant/${v}`] = k
          const bundle = String(ENV().FULL_STACK_BUNDLE_VARIANT || '').trim()
          if (/^\d+$/.test(bundle)) keyOf[`gid://shopify/ProductVariant/${bundle}`] = 'classic-stack'
          overrides = lineItems.map((l) => {
            const price = local.prices[keyOf[l.variantId]]
            return price > 0 ? { ...l, priceOverride: { amount: price.toFixed(2), currencyCode: currency } } : l
          })
        }
      } catch (err) { console.error('local price override skipped', err && err.message) }
    }
    const create = async (useCurrency) => {
    const res = await fetch(`https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({
        query: `mutation Create($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder { id invoiceUrl shippingAddress { countryCodeV2 } totalPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } } subtotalPriceSet { presentmentMoney { amount } } totalTaxSet { presentmentMoney { amount } } lineItems(first: 20) { nodes { title quantity originalUnitPriceSet { presentmentMoney { amount currencyCode } } discountedTotalSet { presentmentMoney { amount } } } } }
            userErrors { field message }
          }
        }`,
        variables: {
          input: {
            lineItems: useCurrency && overrides ? overrides : lineItems,
            tags: promo ? ['preorder', 'promo-' + promo.code.toLowerCase()] : ['preorder'],
            ...(promo ? { appliedDiscount: { title: promo.code, description: promo.percent + '% off your order', valueType: 'PERCENTAGE', value: promo.percent } } : {}),
            // No shipping line is added here: Shopify picks the shipping rate from the address the customer enters at checkout
            // (free shipping for the US is a rate in Shopify's shipping settings; Managed Markets prices every other country).
            // A line added here would stay on the order whatever country the customer switches to.
            note: 'Pre-order placed on the pilr site',
            ...(useCurrency && currency ? { presentmentCurrencyCode: currency } : {}),
            ...(useCurrency && marketCountry ? { marketRegionCountryCode: marketCountry } : {}),
            ...(addressCountry ? { shippingAddress: { countryCode: addressCountry } } : {}),
          },
        },
      }),
    })
    const payload = await res.json()
    const result = payload && payload.data && payload.data.draftOrderCreate
    const url = result && result.draftOrder && result.draftOrder.invoiceUrl
    if (!res.ok || payload.errors || (result && result.userErrors && result.userErrors.length) || !url) {
      const detail = JSON.stringify(payload && (payload.errors || (result && result.userErrors)) || {}).slice(0, 600)
      console.error('draftOrderCreate failed', detail)
      throw new Error('draft order failed: HTTP ' + res.status + ' ' + detail)   // detail: temporary, for the first live test
    }
    return { url, result }
    }
    // If the shopper's currency is not enabled in Shopify (e.g. "Currency (MXN) is not enabled on this store"),
    // fall back to a US-dollar order so checkout still works.
    let made
    try { made = await create(true) } catch (err) {
      if (!currency) throw err
      console.error('currency checkout failed, retrying in USD', currency, err && err.message)
      made = await create(false)
    }
    const { url, result } = made
    // body.test: while the currency checkout is being tried out, also return what Shopify priced (no card is charged by creating a draft order).
    const draftOrderId = String(result.draftOrder.id || '').split('/').pop()   // gid://shopify/DraftOrder/123 -> 123
    return json(200, body && body.test ? { url, draftOrderId, priced: result.draftOrder } : { url, draftOrderId })
  } catch (err) {
    return json(500, { error: 'checkout unavailable', reason: err && err.message })   // reason: temporary, for the first live test
  }
}
