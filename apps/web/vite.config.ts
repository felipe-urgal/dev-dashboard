import {
  defineConfig
} from "vite";

import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [
    vue()
  ],

  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,

    proxy: {
      "/api": {
        target: "http://127.0.0.1:4343",
        changeOrigin: false
      }
    }
  },

  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true
  }
});
