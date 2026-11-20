// Cloudflare Pages Function for /api/claim-review. The logic lives in netlify/functions/claim-review.mjs
// (shared with the Netlify setup); this wrapper only hands Cloudflare's env to it.
import handler from '../../netlify/functions/claim-review.mjs'

export async function onRequest({ request, env }) {
  globalThis.__ENV = env
  return handler(request)
}
