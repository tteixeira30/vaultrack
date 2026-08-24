import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // PWA instalável: service worker com atualização automática + manifest.
    // As cores correspondem aos design tokens do tema escuro (--bg em src/styles.css).
    VitePWA({
      registerType: 'autoUpdate',
      // O registo é feito à mão no main.jsx (virtual:pwa-register), que recarrega
      // a página quando a versão nova assume o controlo; o script injetado pelo
      // plugin limitava-se a registar o service worker e deixava a página antiga
      // a pedir chunks que já não existem.
      injectRegister: null,
      manifest: {
        name: 'Vaultrack',
        short_name: 'Vaultrack',
        description: 'Finanças pessoais',
        lang: 'pt-PT',
        display: 'standalone',
        start_url: '/',
        background_color: '#0b0d13',
        theme_color: '#0b0d13',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/test/**', 'src/main.jsx'],
      reporter: ['text', 'html'],
    },
  },
})
