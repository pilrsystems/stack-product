// Cloudflare Pages Function for /api/promo. The logic lives in netlify/functions/promo.mjs.
import handler from '../../netlify/functions/promo.mjs'

export async function onRequest({ request, env }) {
  globalThis.__ENV = env
  return handler(request)
}
