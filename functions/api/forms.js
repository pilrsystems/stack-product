// POST /api/forms  (Cloudflare Pages Function)
//
// Receives the Contact and "Tell us" forms and emails them to the team. This replaces
// Netlify Forms, which only works on Netlify.
//
// Settings (Cloudflare Pages > Settings > Variables and Secrets):
//   RESEND_API_KEY   API key from resend.com (a secret)
//   FORMS_FROM       sender, e.g. "pilr website <forms@pilrsystems.com>" (the domain must be verified in Resend)
//   FORMS_TO         where the messages go; default support@pilrsystems.com
//
// STATUS: written but NOT yet tested (needs a Resend account and a verified sending domain).
// Until RESEND_API_KEY is set it answers 503 and the form shows its "please email us" message.

const SUBJECT = {
  contact: 'pilr website: contact form',
  'supplement-request': 'pilr website: supplement request',
}
const LABEL = {
  name: 'Name', email: 'Email', order: 'Order number', message: 'Message',
  supplement: 'Supplement', brand: 'Brand', form: 'Form', pod: 'Pod', daily_amount: 'Daily amount', notes: 'Notes',
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY) return json(503, { error: 'forms not configured' })

  let fields
  try {
    const text = await request.text()
    if (text.length > 20000) return json(413, { error: 'too large' })
    fields = Object.fromEntries(new URLSearchParams(text))
  } catch (_) {
    return json(400, { error: 'bad request' })
  }

  // Honeypot: real people leave this empty. Pretend it worked so bots move on.
  if (fields['bot-field']) return json(200, { ok: true })

  const formName = fields['form-name']
  if (!SUBJECT[formName]) return json(400, { error: 'unknown form' })
  const email = String(fields.email || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'email required' })

  const lines = Object.keys(LABEL)
    .filter((k) => fields[k] && String(fields[k]).trim())
    .map((k) => `${LABEL[k]}: ${String(fields[k]).trim().slice(0, 4000)}`)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.FORMS_FROM || 'pilr website <forms@pilrsystems.com>',
      to: [env.FORMS_TO || 'support@pilrsystems.com'],
      reply_to: email,
      subject: SUBJECT[formName],
      text: lines.join('\n'),
    }),
  })
  if (!res.ok) return json(502, { error: 'send failed' })
  return json(200, { ok: true })
}
