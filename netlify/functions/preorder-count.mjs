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
                            Default: "test:false" (cancelled orders are always left out)
                            Add a start date to count only from when pre-orders
                            opened, e.g.  created_at:>=2026-12-01 test:false -status:cancelled
     PREORDER_GOAL          default 1000

   STATUS: written but NOT yet tested against the live store (needs the
   credentials). If anything fails the function returns an error and the
   site keeps showing its built-in number (CLAIMED in src/preorder.js).
──────────────────────────────────────────────── */

// Settings come from Netlify's process.env, or from Cloudflare's env (set by functions/api/*.js).
const ENV = () => globalThis.__ENV || (typeof process !== 'undefined' && process.env ? process.env : {})

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
      'Access-Control-Allow-Origin': ENV().SITE_ORIGIN || '*',
      ...extra,
    },
  })
}

async function getAccessToken(domain) {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) return cachedToken
  const clientId = ENV().SHOPIFY_CLIENT_ID
  const clientSecret = ENV().SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    const missing = [!clientId && 'SHOPIFY_CLIENT_ID', !clientSecret && 'SHOPIFY_CLIENT_SECRET'].filter(Boolean).join(' and ')
    throw new Error('Shopify Admin API is not configured (missing ' + missing + ')')
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

export async function countOrders() {
  if (cachedCount !== null && Date.now() - cachedCountAt < CACHE_MS) return cachedCount
  const domain = ENV().SHOPIFY_STORE_DOMAIN
  if (!domain) throw new Error('Shopify Admin API is not configured (missing SHOPIFY_STORE_DOMAIN)')
  const token = await getAccessToken(domain)
  // Real (non-test) orders, counted here one page at a time so cancelled ones can be left out by their
  // cancelledAt date. (Shopify's search word for cancelled orders did not exclude them reliably.)
  const search = ENV().PREORDER_ORDER_QUERY || 'test:false'
  let count = 0
  let after = null
  for (let page = 0; page < 10; page++) {
    const res = await fetch(`https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({
        query: 'query Orders($q: String, $after: String) { orders(first: 250, query: $q, after: $after) { nodes { cancelledAt } pageInfo { hasNextPage endCursor } } }',
        variables: { q: search, after },
      }),
    })
    const payload = await res.json()
    const orders = payload && payload.data && payload.data.orders
    if (!res.ok || payload.errors || !orders) throw new Error('Shopify order count failed')
    count += orders.nodes.filter((o) => !o.cancelledAt).length
    if (!orders.pageInfo.hasNextPage) break
    after = orders.pageInfo.endCursor
  }
  cachedCount = count
  cachedCountAt = Date.now()
  return count
}

export default async () => {
  try {
    const claimed = await countOrders()
    const goal = Number(ENV().PREORDER_GOAL) || 1000
    return json(200, { claimed, goal }, { 'Cache-Control': 'public, max-age=60' })
  } catch (err) {
    console.error('preorder-count:', err && err.message)
    return json(500, { error: 'count unavailable' })
  }
}
