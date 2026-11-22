/* ─────────────────────────────────────────────
   Password page for the whole site (Cloudflare Pages middleware).

   Turned ON by setting SITE_PASSWORD in Cloudflare (Settings > Variables and
   Secrets, under Production and/or Preview). Turned OFF by deleting that
   variable: with no SITE_PASSWORD the site is open to everyone, exactly as before.

   Visitors without the right cookie see a password form instead of any page
   (pages, images and /api/* alike). A correct password sets a cookie for 30 days.
   Only the logo, favicons and share image stay public, so the password page
   (and link previews) can show them. Search engines are not told to skip the page.
──────────────────────────────────────────────── */

const COOKIE = 'pilr_access'
const OPEN_PATHS = ['/images/logov3-cropped.png', '/favicon.ico', '/favicon.png', '/favicon-32.png', '/favicon-192.png', '/favicon-512.png', '/apple-touch-icon.png', '/og-share.jpg']

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
// Compare two hex strings without stopping at the first difference.
function sameText(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
function readCookie(request, name) {
  const m = (request.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='))
  return m ? m.slice(name.length + 1) : ''
}
// Only ever send people back to a page on this site.
function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/'
}

function page(next, wrong) {
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>pilr</title>
<meta property="og:title" content="pilr"><meta property="og:image" content="/og-share.jpg">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #fafaf8; color: #5e6e7a;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
  main { width: 100%; max-width: 340px; padding: 0 24px; text-align: center; }
  img { width: 96px; height: auto; margin-bottom: 28px; }
  p { margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #7a8a94; }
  form { display: flex; flex-direction: column; gap: 10px; }
  input { width: 100%; border: 1px solid rgba(66,85,99,0.25); border-radius: 4px; padding: 13px 14px; font: inherit; font-size: 15px; color: #46545e; background: #fff; text-align: center; }
  input:focus { outline: none; border-color: #5e6e7a; }
  button { border: none; border-radius: 4px; padding: 14px; background: #7f8d99; color: #fff; font: inherit; font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; }
  button:hover { background: #6e7c88; }
  .err { margin: 12px 0 0; font-size: 13px; color: #9a5a5a; }
</style></head>
<body><main>
  <img src="/images/logov3-cropped.png" alt="pilr">
  <p>Pre-orders go live tomorrow, 11/23, at 5 PM PST.</p>
  <form method="post" action="/__password">
    <input type="hidden" name="next" value="${next.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}">
    <input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required>
    <button type="submit">Enter</button>
  </form>
  ${wrong ? '<p class="err">That password is not right.</p>' : ''}
</main></body></html>`
  return new Response(html, {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function onRequest({ request, env, next }) {
  const password = env.SITE_PASSWORD
  if (!password) return next()   // no password set: the site is open

  const url = new URL(request.url)
  if (OPEN_PATHS.includes(url.pathname)) return next()

  const token = await sha256('pilr-site-access:' + password)

  if (url.pathname === '/__password' && request.method === 'POST') {
    const form = await request.formData()
    const next_ = safeNext(form.get('next'))
    const given = await sha256('pilr-site-access:' + String(form.get('password') || ''))
    if (sameText(given, token)) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: next_,
          'Cache-Control': 'no-store',
          'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Lax`,
        },
      })
    }
    return page(next_, true)
  }

  if (sameText(readCookie(request, COOKIE), token)) return next()
  return page(safeNext(url.pathname + url.search), false)
}
