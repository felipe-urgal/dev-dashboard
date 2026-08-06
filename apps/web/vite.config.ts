import { defineConfig, type ProxyOptions } from 'vite';

import vue from '@vitejs/plugin-vue';

import { LocalTokenStore } from '@dev-dashboard/core';

export default defineConfig(async () => {
  const localToken = await new LocalTokenStore().getOrCreate();

  const apiProxy: ProxyOptions = {
    target: 'http://127.0.0.1:4343',
    changeOrigin: false,
    ws: true,

    configure(proxy) {
      proxy.on('proxyReq', (proxyRequest) => {
        proxyRequest.setHeader('X-Dev-Dashboard-Token', localToken);
      });
      proxy.on('proxyReqWs', (proxyRequest) => {
        proxyRequest.setHeader('X-Dev-Dashboard-Token', localToken);
      });
    },
  };

  return {
    plugins: [vue()],

    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,

      proxy: {
        '/api': apiProxy,
      },
    },

    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,

      proxy: {
        '/api': apiProxy,
      },
    },
  };
});
