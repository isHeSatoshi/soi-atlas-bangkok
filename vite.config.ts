import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.geojson'],
  build: { rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl'] } } }, chunkSizeWarningLimit: 1100 },
})
