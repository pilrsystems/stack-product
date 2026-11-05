import { defineConfig } from 'vite'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// Shared page sections. A page writes
//   <!--@include partials/compare.html-->
// or, with values for {{placeholders}} inside the partial,
//   <!--@include partials/tsa.html name="Powder Pod" volume="180.6 mL"-->
// and the file's contents are dropped in at that spot. Edit the file in
// partials/ and every page that includes it changes. Works in the dev server
// (a change to a partial reloads the page) and in `vite build`.
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
          for (const m of attrs.matchAll(/(\w+)="([^"]*)"/g)) {
            text = text.split('{{' + m[1] + '}}').join(m[2])
          }
          return text
        })
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

export default defineConfig({
  base: '/',
  plugins: [htmlPartials()],
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
        classicStack: resolve(__dirname, 'classic-stack.html'),
        powderPod: resolve(__dirname, 'powder-pod.html'),
        hybridPod: resolve(__dirname, 'hybrid-pod.html'),
        pillPod: resolve(__dirname, 'pill-pod.html'),
        travelScooper: resolve(__dirname, 'travel-scooper.html'),
        singleLid: resolve(__dirname, 'single-lid.html'),
        whyPilr: resolve(__dirname, 'why-pilr.html'),
        stack: resolve(__dirname, 'stack.html'),
        claim: resolve(__dirname, 'claim.html'),
        routineProblem: resolve(__dirname, 'the-routine-problem.html'),
        sizeGuide: resolve(__dirname, 'size-guide.html'),
        earlyAccess: resolve(__dirname, 'early-access.html'),
      },
    },
  },
})