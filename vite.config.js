import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/',
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
      },
    },
  },
})