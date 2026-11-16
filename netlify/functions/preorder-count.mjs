/* ─────────────────────────────────────────────
   GET /api/preorder-count  (Netlify Function, ESM/v2 format)

   Returns how many pre-orders have been placed, for the bar and card on the
   product pages:  { "claimed": 0, "goal": 1000 }

   It asks Shopify for the number of orders that match PREORDER_ORDER_QUERY.
   Uses the same Shopify app + environment variables as claim-review.mjs
   (SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET; the app
   needs the read_orders scope, which it already has).

   Optional environment variables:
     PREORDER_ORDER_QUERY   Shopify order search that decides which orders count.
                            Default: "test:false -status:cancelled"
                            Add a start date to count only from when pre-orders
                            opened, e.g.  created_at:>=2026-12-01 test:false -status:cancelled
     PREORDER_GOAL          default 1000

   STATUS: written but NOT yet tested against the live store (needs the
   credentials). If anything fails the function returns an error and the
   site keeps showing its built-in number (CLAIMED in src/preorder.js).
──────────────────────────────────────────────── */

const ADMIN_API_VERSION = '2024-10'
const TOKEN_REFRESH_BUFFER_MS = 60_000
const CACHE_MS = 60_000

let cachedToken = null
let cachedTokenExpiresAt = 0
let cachedCount = null
let cachedCountAt = 0

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.SITE_ORIGIN || '*',
      ...extra,
    },
  })
}

async function getAccessToken(domain) {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) return cachedToken
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Shopify Admin API is not configured (missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET)')
  }
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

async function countOrders() {
  if (cachedCount !== null && Date.now() - cachedCountAt < CACHE_MS) return cachedCount
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  if (!domain) throw new Error('Shopify Admin API is not configured (missing SHOPIFY_STORE_DOMAIN)')
  const token = await getAccessToken(domain)
  const search = process.env.PREORDER_ORDER_QUERY || 'test:false -status:cancelled'
  const res = await fetch(`https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      query: 'query Count($q: String) { ordersCount(query: $q, limit: null) { count } }',
      variables: { q: search },
    }),
  })
  const payload = await res.json()
  const count = payload && payload.data && payload.data.ordersCount && payload.data.ordersCount.count
  if (!res.ok || payload.errors || typeof count !== 'number') throw new Error('Shopify order count failed')
  cachedCount = count
  cachedCountAt = Date.now()
  return count
}

export default async () => {
  try {
    const claimed = await countOrders()
    const goal = Number(process.env.PREORDER_GOAL) || 1000
    return json(200, { claimed, goal }, { 'Cache-Control': 'public, max-age=60' })
  } catch (err) {
    return json(500, { error: 'count unavailable' })
  }
}
