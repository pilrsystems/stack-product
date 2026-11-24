// Same-origin Storefront API proxy, used ONLY for Shopify's consent + tracking cookies.
// Shopify's Customer Privacy script calls POST /api/unstable/graphql.json on this site; this
// forwards it to the Shopify checkout domain and hands the response (including the
// backend-managed Set-Cookie headers) back, so the cookies belong to this site.
//
// Deliberately narrow: POST only, small body, and only the consentManagement query.
// It carries no secrets; the public Storefront token comes from the browser, as in src/shopify.js.
const UPSTREAM = 'https://checkout.pilrsystems.com/api/unstable/graphql.json'
const FORWARD = ['content-type', 'x-shopify-storefront-access-token', 'shopify-storefront-consent-management', 'x-shopify-visittoken', 'x-shopify-uniquetoken', 'user-agent', 'accept-language', 'cookie']

export async function onRequest({ request }) {
  const hostname = new URL(request.url).hostname
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } })
  const body = await request.text()
  if (body.length > 4000 || !body.includes('consentManagement')) return new Response('Not allowed', { status: 400 })

  const headers = new Headers()
  FORWARD.forEach((h) => { const v = request.headers.get(h); if (v) headers.set(h, v) })
  // Shopify decides the visitor's region (and so consent rules) from the buyer's IP, not Cloudflare's.
  const ip = request.headers.get('cf-connecting-ip')
  if (ip) headers.set('Shopify-Storefront-Buyer-IP', ip)

  const res = await fetch(UPSTREAM, { method: 'POST', headers, body })
  const out = new Headers()
  ;['content-type', 'server-timing'].forEach((h) => { const v = res.headers.get(h); if (v) out.set(h, v) })
  // Keep every cookie Shopify sets; drop any Domain= so it applies to this site.
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  cookies.forEach((c) => out.append('Set-Cookie', c.replace(/;\s*Domain=[^;]*/i, '')))
  out.set('Cache-Control', 'no-store')
  // Shopify names pilrsystems.com as the cookie domain. A preview (*.pages.dev) cannot set cookies for another
  // domain, so name the host the visitor is actually on. On pilrsystems.com this is the same value.
  let text = await res.text()
  try {
    const j = JSON.parse(text)
    const c = j && j.data && j.data.consentManagement && j.data.consentManagement.cookies
    if (c && c.cookieDomain) { c.cookieDomain = hostname; text = JSON.stringify(j) }
  } catch (_) {}
  return new Response(text, { status: res.status, headers: out })
}
