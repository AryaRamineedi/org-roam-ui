import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// org-ascipio ships as a static SPA build (committed into ../dist) that is
// served three ways: Emacs's simple-httpd (browser + xwidget-webkit modes)
// and the Tauri shell (standalone mode). No SSR, no API routes.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
})
