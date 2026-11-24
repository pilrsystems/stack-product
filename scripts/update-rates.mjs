// Refreshes the exchange rates used by the site and checkout (netlify/functions/currency.mjs).
//   node scripts/update-rates.mjs
// Run it about once a week, then commit and push. Rates come from open.er-api.com (free).
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const file = resolve(root, 'netlify/functions/currency.mjs')
const res = await fetch('https://open.er-api.com/v6/latest/USD')
const data = await res.json()
if (!data || !data.rates) throw new Error('No rates came back')
const text = readFileSync(file, 'utf8')
const m = text.match(/export const RATES = (\{[\s\S]*?\n\})/)
const current = JSON.parse(m[1].replace(/(\w+):/g, '"$1":').replace(/,\s*}/, '}'))
const next = {}
for (const c of Object.keys(current)) next[c] = c === 'USD' ? 1 : Number((data.rates[c] ?? current[c]).toPrecision(6))
const body = '{\n' + Object.entries(next).map(([k, v]) => `  ${k}: ${v},`).join('\n') + '\n}'
const today = new Date().toISOString().slice(0, 10)
writeFileSync(file, text.replace(m[1], body).replace(/RATES_UPDATED = '[^']*'/, `RATES_UPDATED = '${today}'`))
console.log('Updated ' + Object.keys(next).length + ' rates for ' + today)
