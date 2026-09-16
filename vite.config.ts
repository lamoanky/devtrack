import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // This project lives under a OneDrive-synced path, where Windows file
    // notifications are unreliable — a missed event leaves Vite serving a stale
    // transform of a file that has already changed on disk, which looks like a
    // phantom bug (the source is right, the browser is wrong). Polling trades a
    // little CPU for a watcher that cannot miss a write. Safe to remove if you
    // move the project off OneDrive.
    watch: { usePolling: true, interval: 500 },
    proxy: {
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true,
      },
    },
  },
})
