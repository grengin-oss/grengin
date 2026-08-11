// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tauriDevHost = process.env.TAURI_DEV_HOST

  return {
    plugins: [svelte()],
    resolve: {
      alias: {
        '$lib': path.resolve('./src/lib')
      }
    },
    build: {
      assetsInlineLimit: 0,
      cssMinify: 'esbuild',
      emptyOutDir: true,
      minify: 'esbuild',
      modulePreload: {
        polyfill: false,
      },
      reportCompressedSize: false,
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (/[\\/]node_modules[\\/](vega|vega-lite|vega-embed|vega-[^\\/]+)[\\/]/.test(id)) {
              return 'vega';
            }
            if (/[\\/]node_modules[\\/](marked|highlight\.js|dompurify)[\\/]/.test(id)) {
              return 'markdown';
            }
          },
        },
      },
    },
    esbuild: {
      drop: mode === 'production' ? ['debugger'] : [],
      legalComments: 'none',
      pure: mode === 'production' ? ['console.debug'] : [],
    },
    server: {
      port: 5173,
      strictPort: true,
      host: tauriDevHost || false,
      hmr: tauriDevHost
        ? {
            protocol: 'ws',
            host: tauriDevHost,
            port: 5174,
          }
        : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
      proxy: {
        '/api': {
          // Proxy API calls to backend; default local backend runs on 8080
          target: env.VITE_API_BASE || 'https://grengin-test-production.up.railway.app',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
