// GET /api/geo -> which country Cloudflare says the visitor is in, the currency we'd show them,
// the list of countries for the picker, and the rates table (the fallback if Shopify's prices can't be read).
import { RATES, RATES_UPDATED, COUNTRIES, currencyForCountry } from '../../netlify/functions/currency.mjs'

export async function onRequest({ request }) {
  const country = (request.headers.get('CF-IPCountry') || (request.cf && request.cf.country) || '').toUpperCase()
  const body = { country, currency: currencyForCountry(country), rates: RATES, updated: RATES_UPDATED, countries: COUNTRIES }
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' },
  })
}
