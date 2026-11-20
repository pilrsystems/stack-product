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
  const payload = await res.json()
  if (!res.ok || !payload.access_token) throw new Error('Shopify token exchange failed')
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

  // Full Stacks: one of each pod, $68 in total. 16/84 off the three pods' list prices.
  if (stacks > 0) {
    const listTotal = POD_PRICE['pill-pod'] + POD_PRICE['hybrid-pod'] + POD_PRICE['powder-pod']  // 84
    const pct = ((listTotal - FULL_STACK_PRICE) / listTotal) * 100
    for (const id of ['pill-pod', 'hybrid-pod', 'powder-pod']) {
      lines.push({
        variantId: gid(id),
        quantity: stacks,
        appliedDiscount: { title: 'Full Stack', valueType: 'PERCENTAGE', value: Number(pct.toFixed(4)) },
        customAttributes: [{ key: 'bundle', value: 'full-stack' }],
      })
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

export default async (req) => {
  if (ENV().CHECKOUT_ENABLED !== 'true') return json(503, { error: 'checkout not enabled' })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  let body
  try { body = await req.json() } catch (_) { return json(400, { error: 'bad request' }) }
  const lineItems = buildLines(normaliseCart(body))
  if (!lineItems.length) return json(400, { error: 'empty cart' })

  try {
    const domain = ENV().SHOPIFY_STORE_DOMAIN
    if (!domain) throw new Error('missing SHOPIFY_STORE_DOMAIN')
    const token = await getAccessToken(domain)
    const res = await fetch(`https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({
        query: `mutation Create($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder { id invoiceUrl totalPriceSet { shopMoney { amount } } }
            userErrors { field message }
          }
        }`,
        variables: {
          input: {
            lineItems,
            tags: ['preorder'],
            shippingLine: { title: 'Free shipping', price: '0.00' },
            note: 'Pre-order placed on the pilr site',
          },
        },
      }),
    })
    const payload = await res.json()
    const result = payload && payload.data && payload.data.draftOrderCreate
    const url = result && result.draftOrder && result.draftOrder.invoiceUrl
    if (!res.ok || payload.errors || (result && result.userErrors && result.userErrors.length) || !url) {
      console.error('draftOrderCreate failed', JSON.stringify(payload && (payload.errors || (result && result.userErrors))))
      throw new Error('draft order failed')
    }
    return json(200, { url })
  } catch (err) {
    return json(500, { error: 'checkout unavailable' })
  }
}
