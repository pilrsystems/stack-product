import { defineConfig } from 'vite'
import { resolve } from 'path'
import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { dirname } from 'path'

// Shared page sections. A page writes
//   <!--@include partials/compare.html-->
// or, with values for {{placeholders}} inside the partial,
//   <!--@include partials/tsa.html name="Powder Pod" volume="180.6 mL"-->
// and the file's contents are dropped in at that spot. Edit the file in
// partials/ and every page that includes it changes. Works in the dev server
// (a change to a partial reloads the page) and in `vite build`.

// Numbers for the "Your pre-order includes" box and the pre-order button label. Written in pages/partials as
// {{pi.pods3Retail}}, {{pi.totalValue}} ... and filled in from partials/preorder-pricing.json (the one place to edit).
// Total value = pods retail + scooper + shipping; code price = pod price minus the code's percent.
const money = (n) => '$' + (Number.isInteger(Math.round(n * 100) / 100) ? String(Math.round(n * 100) / 100) : n.toFixed(2))
function PRE_ORDER_PRICES(product = 'full-stack') {
  const p = JSON.parse(readFileSync(resolve(__dirname, 'partials/preorder-pricing.json'), 'utf8'))
  const item = p.products[product] || p.products['full-stack']
  const total = item.retail + (item.scooper === false ? 0 : p.scooperValue) + p.shippingValue
  const code = item.price * (1 - p.codePercent / 100)
  return {
    pods3Retail: money(item.retail),
    pods3Price: money(item.price),
    scooperValue: money(p.scooperValue),
    shippingValue: money(p.shippingValue),
    totalValue: money(total),
    codePrice: money(code),
    savePercent: String(Math.round((1 - code / total) * 100)),
    codePercent: String(p.codePercent),
    heading: item.heading || 'Your pre-order offer',
    shippingNum: String(p.shippingValue),
    scooperNum: String(p.scooperValue),
    percentNum: String(p.codePercent),
    shipDate: p.shipDate,
    shipDateShort: String(p.shipDate).replace(/^(\w{3})\w*/, (m, a) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase() + '.'),   // 'January 25' -> 'Jan. 25' (phone wording)
    codeLimit: p.codeLimit,
    saveAmount: money(total - code),
  }
}

const INCLUDE = /<!--@include\s+(\S+?)((?:\s+\w+="[^"]*")*)\s*-->/g
function htmlPartials() {
  const dir = resolve(__dirname, 'partials')
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(INCLUDE, (_, file, attrs) => {
          let text = readFileSync(resolve(__dirname, file), 'utf8')
          let product = 'full-stack'
          for (const m of attrs.matchAll(/(\w+)="([^"]*)"/g)) {
            text = text.split('{{' + m[1] + '}}').join(m[2])
            if (m[1] === 'product') product = m[2]
          }
          const cfg = (JSON.parse(readFileSync(resolve(__dirname, 'partials/preorder-pricing.json'), 'utf8')).products[product] || {})
          const hasGift = cfg.scooper !== false
          const giftDynamic = cfg.scooper === 'dynamic'
          text = text.split('{{dynAttr}}').join(cfg.dynamic ? ' data-pi-dynamic' : '')
          const showSummary = cfg.summary !== false
          const headingPill = cfg.headingPill !== false
          // the green pill is either the heading (pods) or sits at the left of the price line (Full Stack)
          text = headingPill
            ? text.replace(/[ \t]*<!--if:linepill-->[\s\S]*?<!--endif:linepill-->\n?/g, '').split('{{headClass}}').join(' pi-heading--pill')
            : text.replace(/<!--(?:end)?if:linepill-->\n?/g, '').split('{{headClass}}').join('')
          // single-pod pages: no price line under the box (the green pill at the top is their only headline)
          text = showSummary
            ? text.replace(/<!--(?:end)?if:line-->\n?/g, '')
            : text.replace(/[ \t]*<!--if:line-->[\s\S]*?<!--endif:line-->\n?/g, '')
          // pages without the free-scooper gift drop the block between <!--if:gift--> and <!--endif:gift-->
          text = hasGift ? text.replace(/<!--(?:end)?if:gift-->\n?/g, '').replace('<div class="pi-gift">', giftDynamic ? '<div class="pi-gift" hidden>' : '<div class="pi-gift">') : text.replace(/[ \t]*<!--if:gift-->[\s\S]*?<!--endif:gift-->\n?/g, '')
          // {{pi.*}} numbers for the product named in the include (default: Full Stack)
          text = text.replace(/\{\{pi\.(\w+)\}\}/g, (all, key) => (PRE_ORDER_PRICES(product)[key] ?? all))
          return text
        }).replace(/\{\{pi\.(\w+)\}\}/g, (all, key) => (PRE_ORDER_PRICES()[key] ?? all))
      },
    },
    configureServer(server) {
      server.watcher.add(dir)
      server.watcher.on('change', (f) => {
        if (f.startsWith(dir)) server.ws.send({ type: 'full-reload' })
      })
    },
  }
}


// Images that are only named inside JavaScript (the home page hero slides, videos, posters) are
// not seen by Vite's build, so they were missing from the live site. After the build, this copies
// every images/... file that a page or script mentions into dist at the same path.
const IMAGE_REF = /['"(=]\s*((?:\.\/)?images\/[^'"()<>]+?\.(?:png|jpe?g|webp|svg|gif|mp4|webm|mov))/gi
function copyReferencedImages() {
  return {
    name: 'copy-referenced-images',
    apply: 'build',
    closeBundle() {
      const sources = []
      for (const dir of ['.', 'src', 'public']) {
        const abs = resolve(__dirname, dir)
        if (!existsSync(abs)) continue
        for (const f of readdirSync(abs)) if (/\.(html|js)$/.test(f)) sources.push(resolve(abs, f))
      }
      const seen = new Set()
      for (const file of sources) {
        const text = readFileSync(file, 'utf8')
        for (const m of text.matchAll(IMAGE_REF)) {
          let rel
          try { rel = decodeURIComponent(m[1]).replace(/^\.\//, '') } catch (_) { continue }
          if (seen.has(rel)) continue
          seen.add(rel)
          const from = resolve(__dirname, rel)
          const to = resolve(__dirname, 'dist', rel)
          if (!existsSync(from)) continue
          mkdirSync(dirname(to), { recursive: true })
          copyFileSync(from, to)
        }
      }
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [htmlPartials(), copyReferencedImages()],
  server: {
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        catalog: resolve(__dirname, 'catalog.html'),
        about: resolve(__dirname, 'about.html'),
        builder: resolve(__dirname, 'stack-builder.html'),
        system: resolve(__dirname, 'build-your-system.html'),
        privacy: resolve(__dirname, 'privacy-policy.html'),
        terms: resolve(__dirname, 'terms-of-service.html'),
        classicStack: resolve(__dirname, 'full-stack.html'),
        powderPod: resolve(__dirname, 'powder-pod.html'),
        hybridPod: resolve(__dirname, 'large-pill-pod.html'),
        pillPod: resolve(__dirname, 'small-pill-pod.html'),
        travelScooper: resolve(__dirname, 'travel-scooper.html'),
        singleLid: resolve(__dirname, 'single-lid.html'),
        whyPilr: resolve(__dirname, 'why-pilr.html'),
        stack: resolve(__dirname, 'stack.html'),
        claim: resolve(__dirname, 'claim.html'),
        routineProblem: resolve(__dirname, 'the-routine-problem.html'),
        sizeGuide: resolve(__dirname, 'size-guide.html'),
        earlyAccess: resolve(__dirname, 'early-access.html'),
        shippingInfo: resolve(__dirname, 'shipping-information.html'),
        returnsExchanges: resolve(__dirname, 'returns-exchanges.html'),
        preorderRefund: resolve(__dirname, 'pre-order-refund-policy.html'),
        contactUs: resolve(__dirname, 'contact-us.html'),
        tellUs: resolve(__dirname, 'tell-us.html'),
        faq: resolve(__dirname, 'faq.html'),
        cart: resolve(__dirname, 'cart.html'),
        shop: resolve(__dirname, 'shop.html'),
      },
    },
  },
})