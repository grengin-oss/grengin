import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

// https://vite.dev/config/

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [svelte()],
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_BASE || 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    resolve: {
      alias: {
        $lib: resolve('./src/lib')
      }
    }
  }
})
