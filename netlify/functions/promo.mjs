/* POST /api/promo  { "code": "FIRST1000" }  ->  { valid: true, code, percent } or { valid: false, message }
   Lets the cart check a promo code before checkout. The rules live in create-checkout.mjs (checkPromo). */
import { checkPromo } from './create-checkout.mjs'

const ENV = () => globalThis.__ENV || (typeof process !== 'undefined' && process.env ? process.env : {})

export default async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ENV().SITE_ORIGIN || '*' }
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers })
  let body
  try { body = await req.json() } catch (_) { return new Response(JSON.stringify({ error: 'bad request' }), { status: 400, headers }) }
  const result = await checkPromo(body && body.code)
  return new Response(JSON.stringify(result), { status: 200, headers })
}
