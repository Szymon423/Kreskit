import { defineConfig } from 'vite'

export default defineConfig({
  // Tauri expects a fixed port and prints its own output to the same terminal.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
