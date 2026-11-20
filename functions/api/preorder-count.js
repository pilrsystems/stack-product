// Cloudflare Pages Function for /api/preorder-count. The logic lives in netlify/functions/preorder-count.mjs
// (shared with the Netlify setup); this wrapper only hands Cloudflare's env to it.
import handler from '../../netlify/functions/preorder-count.mjs'

export async function onRequest({ request, env }) {
  globalThis.__ENV = env
  return handler(request)
}
