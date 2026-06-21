import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    allowedHosts: ['.loca.lt'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util', 'events', 'path'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  optimizeDeps: {
    include: [
      '@unicitylabs/sphere-sdk',
      '@unicitylabs/sphere-sdk/connect',
      '@unicitylabs/sphere-sdk/connect/browser',
    ],
  },
  build: {
    target: 'es2020',
    commonjsOptions: { transformMixedEsModules: true },
  },
})