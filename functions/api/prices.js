// GET /api/prices?country=CA -> Shopify's own local prices for that country, so the site shows exactly what checkout charges.
import { getLocalPrices } from '../../netlify/functions/create-checkout.mjs'

export async function onRequest({ request, env }) {
  globalThis.__ENV = env
  const country = new URL(request.url).searchParams.get('country')
  try {
    const out = await getLocalPrices(country)
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'prices unavailable', reason: err && err.message }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })   // 200 so Cloudflare keeps the body; the site only uses a reply that has 'prices'. reason: temporary, until verified live
  }
}
