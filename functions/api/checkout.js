// Cloudflare Pages Function for /api/checkout. The logic lives in netlify/functions/create-checkout.mjs
// (shared with the Netlify setup); this wrapper only hands Cloudflare's env to it.
import handler from '../../netlify/functions/create-checkout.mjs'

export async function onRequest({ request, env }) {
  globalThis.__ENV = env
  return handler(request)
}
