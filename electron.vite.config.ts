import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@core': resolve(__dirname, 'src/core'),
  '@shared': resolve(__dirname, 'src/shared')
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      // Runtime dependencies (music-metadata is ESM-only) are bundled so the main
      // bundle and the scanner worker are self-contained CommonJS files.
      rollupOptions: {
        // electron-updater stays a real node_modules dependency: it reads
        // app-update.yml relative to its own packaged location and pulls in
        // optional helpers that must not be inlined into the bundle.
        external: ['electron', 'electron-updater'],
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          scannerWorker: resolve(__dirname, 'src/main/library/scanner.worker.ts')
        }
      }
    }
  },
  preload: {
    resolve: { alias },
    build: {
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    plugins: [react()]
  }
})
