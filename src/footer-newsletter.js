// The "Never miss a day" email box in the shared footer (partials/footer.html), on every page.
// Saves the address to the Shopify customer list and to Klaviyo, keeps the consent record, and thanks the visitor.
import './shopify.js' // defines window.subscribeEmail and window.subscribeEmailToKlaviyo

const form = document.getElementById('footer-email-form')

function logConsent(email, source) {
  try {
    const record = {
      email,
      consent_given: true,
      timestamp: new Date().toISOString(),
      page_url: window.location.href,
      privacy_policy_version: '2026-03-24',
      terms_version: '2026-03-24',
      source,
    }
    const existing = JSON.parse(localStorage.getItem('pilr_consent_log') || '[]')
    existing.push(record)
    localStorage.setItem('pilr_consent_log', JSON.stringify(existing))
  } catch (err) {
    console.warn('[consent] could not store the record:', err)
  }
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const input = form.querySelector('input[type="email"]')
    const btn = form.querySelector('button[type="submit"]')
    const email = (input.value || '').trim()
    if (!email) return
    btn.disabled = true
    input.disabled = true

    logConsent(email, 'footer_newsletter')
    try {
      await Promise.all([
        window.subscribeEmail ? window.subscribeEmail(email) : Promise.resolve(),
        window.subscribeEmailToKlaviyo ? window.subscribeEmailToKlaviyo(email) : Promise.resolve(),
      ])
    } catch (err) {
      console.warn('[footer newsletter] subscribe error:', err)
    }
    window._learnq = window._learnq || []
    window._learnq.push(['identify', { $email: email }])

    form.innerHTML = '<p class="footer-email-thanks">You\'re on the list. Talk soon.</p>'
  })
}
