/* ─────────────────────────────────────────────
   Currencies the site can show, and the exchange rates for them.

   *** UPDATE THE RATES ONCE A WEEK. ***  Edit `RATES` below (1 US dollar = N of that currency),
   commit and push. The site and the checkout both read this one file, so they always agree.
   (Rates last set 2026-11-24 from open.er-api.com.)

   Prices are rounded to a WHOLE number in the shopper's currency.
   Pricing rules (tiers, Full Stack, promo) still work in US dollars; see localAmount().
──────────────────────────────────────────────── */

export const RATES_UPDATED = '2026-11-24'
export const RATES = { USD: 1, CAD: 1.436, AUD: 1.509, EUR: 0.916, GBP: 0.767, NZD: 1.835 }

// Shown in the header picker: flag + country label + currency name.
export const CURRENCIES = {
  USD: { symbol: '$',   label: 'US',            flag: '🇺🇸' },
  CAD: { symbol: 'CA$', label: 'Canada',        flag: '🇨🇦' },
  AUD: { symbol: 'A$',  label: 'Australia',     flag: '🇦🇺' },
  EUR: { symbol: '€',   label: 'Europe',        flag: '🇪🇺' },
  GBP: { symbol: '£',   label: 'United Kingdom', flag: '🇬🇧' },
  NZD: { symbol: 'NZ$', label: 'New Zealand',   flag: '🇳🇿' },
}

// Two-letter country code (Cloudflare's CF-IPCountry) -> currency. Anything not listed gets USD.
const EUROZONE = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ')
export function currencyForCountry(country) {
  const c = String(country || '').toUpperCase()
  if (c === 'CA') return 'CAD'
  if (c === 'AU') return 'AUD'
  if (c === 'NZ') return 'NZD'
  if (c === 'GB') return 'GBP'
  if (EUROZONE.includes(c)) return 'EUR'
  return 'USD'
}

// US dollars -> whole units of the shopper's currency. USD keeps cents (the existing prices).
export function localAmount(usd, currency) {
  const rate = RATES[currency]
  if (!rate || currency === 'USD') return usd
  return Math.round(usd * rate)
}
