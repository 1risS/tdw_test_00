import { defineConfig } from 'vite'

export default defineConfig({
  base: '/ttu-test-AV/', // Nombre de tu repositorio
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'esnext'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  }
})
