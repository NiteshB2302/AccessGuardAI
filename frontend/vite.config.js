import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon.svg"],
      manifest: {
        name: "Access Guard AI",
        short_name: "AccessGuardAI",
        description: "Enterprise cybersecurity monitoring platform with AI threat detection.",
        theme_color: "#2563eb",
        background_color: "#eef4ff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable any"
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-runtime-cache",
              networkTimeoutSeconds: 6,
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["chart.js", "react-chartjs-2"],
          motion: ["framer-motion"],
          ui: ["lucide-react"],
          network: ["axios"]
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000"
    }
  }
});
