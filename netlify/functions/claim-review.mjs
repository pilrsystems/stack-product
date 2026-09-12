/* ─────────────────────────────────────────────
   POST /api/claim-review  (Netlify Function, ESM/v2 format)

   QR-code review → single-use 30%-off discount flow.
   Full spec: pilr-qr-review-discount-spec.md

   Required environment variables (set in Netlify dashboard,
   never committed):
     SHOPIFY_STORE_DOMAIN     e.g. pilr-2.myshopify.com
     SHOPIFY_CLIENT_ID        client credentials grant client ID
     SHOPIFY_CLIENT_SECRET    client credentials grant client secret
                              (app must have scopes: read_orders,
                              read_customers, write_customers,
                              write_discounts)
     SITE_ORIGIN              e.g. https://pilrsystems.com (for CORS)

   Auth note: this app's Dev Dashboard setup only issues a client ID +
   secret, not a permanent shpat_ token — Admin API access tokens are
   obtained via the client credentials grant and expire after 24h
   (expires_in ~86399s). getAccessToken() below exchanges the client
   secret for a token and re-exchanges it once it's about to expire.
   The cache is just a module-level variable, so it only helps within a
   warm Netlify Function instance — a cold start does one extra token
   fetch, which is fine, not a correctness issue.
   Docs: https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
──────────────────────────────────────────────── */

const ADMIN_API_VERSION = '2024-10'
const CLAIMED_NAMESPACE = 'custom'
const CLAIMED_KEY = 'review_discount_claimed'
const REVIEW_KEY = 'latest_review'
const DISCOUNT_PERCENTAGE = 0.3
const DISCOUNT_DAYS_VALID = 30
const TOKEN_REFRESH_BUFFER_MS = 60_000 // re-exchange 60s before actual expiry

function corsHeaders() {
  const origin = process.env.SITE_ORIGIN || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

// Module-level cache: persists across invocations only while the
// function instance stays warm. See auth note above.
let cachedToken = null
let cachedTokenExpiresAt = 0

async function getAccessToken(domain) {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Shopify Admin API is not configured (missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET env vars)')
  }

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  const payload = await res.json()
  if (!res.ok || !payload.access_token) {
    throw new Error(`Shopify token exchange failed: ${JSON.stringify(payload)}`)
  }

  cachedToken = payload.access_token
  cachedTokenExpiresAt = Date.now() + payload.expires_in * 1000
  return cachedToken
}

async function shopifyAdmin(query, variables) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  if (!domain) {
    throw new Error('Shopify Admin API is not configured (missing SHOPIFY_STORE_DOMAIN env var)')
  }
  const token = await getAccessToken(domain)
  const res = await fetch(`https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const payload = await res.json()
  if (!res.ok || payload.errors) {
    throw new Error(`Shopify Admin API error: ${JSON.stringify(payload.errors || payload)}`)
  }
  return payload.data
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/* Look up the customer by email and check whether they have a real order
   plus whether they've already claimed the discount. Returns
   { customerId } or null if no matching customer/order exists. */
async function findEligibleCustomer(email) {
  const data = await shopifyAdmin(
    `query FindCustomer($query: String!) {
      customers(first: 1, query: $query) {
        edges {
          node {
            id
            numberOfOrders
            claimedMetafield: metafield(namespace: "${CLAIMED_NAMESPACE}", key: "${CLAIMED_KEY}") { value }
          }
        }
      }
    }`,
    { query: `email:${email}` }
  )
  const customer = data.customers.edges[0]?.node
  if (!customer || Number(customer.numberOfOrders) < 1) return null
  return {
    id: customer.id,
    alreadyClaimed: customer.claimedMetafield?.value === 'true',
  }
}

/* Save the review and flip the claimed flag in one mutation.
   v1 storage: a customer metafield. Swap this out once a real review
   platform (Judge.me / Loox / Yotpo / etc.) is chosen — see spec's
   "nice-to-haves" section. */
async function saveReviewAndMarkClaimed(customerId, review) {
  const data = await shopifyAdmin(
    `mutation SetReviewMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: customerId,
          namespace: CLAIMED_NAMESPACE,
          key: CLAIMED_KEY,
          type: 'boolean',
          value: 'true',
        },
        {
          ownerId: customerId,
          namespace: CLAIMED_NAMESPACE,
          key: REVIEW_KEY,
          type: 'json',
          value: JSON.stringify(review),
        },
      ],
    }
  )
  const errs = data.metafieldsSet.userErrors
  if (errs?.length) throw new Error(`metafieldsSet: ${errs.map(e => e.message).join(', ')}`)
}

function randomCodeSuffix(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
  let out = ''
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

async function createDiscountCode(customerId) {
  const now = new Date()
  const endsAt = new Date(now.getTime() + DISCOUNT_DAYS_VALID * 24 * 60 * 60 * 1000)
  const code = `REVIEW30-${randomCodeSuffix()}`

  const data = await shopifyAdmin(
    `mutation CreateReviewDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) { edges { node { code } } }
            }
          }
        }
        userErrors { field message }
      }
    }`,
    {
      basicCodeDiscount: {
        title: `QR-REVIEW-${now.getTime()}`,
        code,
        startsAt: now.toISOString(),
        endsAt: endsAt.toISOString(),
        appliesOncePerCustomer: true,
        usageLimit: 1,
        customerSelection: { customers: { add: [customerId] } },
        customerGets: {
          value: { percentage: DISCOUNT_PERCENTAGE },
          items: { all: true },
        },
        combinesWith: {
          orderDiscounts: false,
          productDiscounts: false,
          shippingDiscounts: false,
        },
      },
    }
  )

  const errs = data.discountCodeBasicCreate.userErrors
  if (errs?.length) throw new Error(`discountCodeBasicCreate: ${errs.map(e => e.message).join(', ')}`)

  return data.discountCodeBasicCreate.codeDiscountNode.codeDiscount.codes.edges[0].node.code
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }
  if (req.method !== 'POST') {
    return json(405, { message: 'Method not allowed' })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return json(400, { message: 'Invalid request body' })
  }

  const { name, email, rating, reviewText, company } = body || {}

  // Honeypot: real visitors never see or fill this field.
  if (company) {
    return json(400, { message: 'Something went wrong — please try again.' })
  }

  if (!name || !isValidEmail(email) || !reviewText || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json(400, { message: 'Please fill out every field with a valid email and star rating.' })
  }

  try {
    const eligible = await findEligibleCustomer(email)

    if (!eligible) {
      return json(404, { message: "We couldn't find an order under this email." })
    }
    if (eligible.alreadyClaimed) {
      return json(409, { message: 'This email has already redeemed this offer.' })
    }

    const review = { name, rating, reviewText, submittedAt: new Date().toISOString() }
    await saveReviewAndMarkClaimed(eligible.id, review)

    const code = await createDiscountCode(eligible.id)

    return json(200, { code })
  } catch (err) {
    console.error('[claim-review] error:', err)
    return json(500, { message: 'Something went wrong — please try again in a moment.' })
  }
}
