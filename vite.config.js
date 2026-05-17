import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  plugins: [
    react(),
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
