import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json';

// The whole app is inlined into dist/index.html (JS, CSS and the fonts), so the
// page also runs straight from disk. A service worker cannot be inlined and an
// installable PWA needs a manifest and icons as real files, so those three
// kinds of file sit beside it. The service worker precaches exactly one page.
export default defineConfig({
  // Relative, so index.html works from file:// and from any sub-path.
  base: './',
  // Ports are part of the F:\Programming local-dev port scheme: one block of
  // ten per web project, +1 for the preview server (see PROJECTS.md).
  server: { port: 5410, strictPort: true },
  preview: { port: 5411, strictPort: true },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2022',
  },
  plugins: [
    viteSingleFile(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null, // registered by hand in main.ts
      // The glob below already lists the icons. Left on, the plugin lists the
      // manifest's icons a second time without a revision, workbox refuses the
      // conflicting entries, and the service worker dies as it starts.
      includeManifestIcons: false,
      workbox: {
        globPatterns: ['index.html', 'icons/*.{png,svg}'],
        // One service-worker file rather than sw.js plus a workbox chunk.
        inlineWorkboxRuntime: true,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Fretron',
        short_name: 'Fretron',
        description: 'An arcade for learning the guitar fretboard.',
        // Keep in sync with --bg in src/app/styles/tokens.css.
        theme_color: '#03060F',
        background_color: '#03060F',
        display: 'fullscreen',
        // The board is played with the phone on its side.
        orientation: 'landscape',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
