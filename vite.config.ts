import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

function offlineManifestPlugin(): Plugin {
  return {
    name: "qsak-offline-manifest",
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((file) => /\.(wasm|mjs|js)$/.test(file) && file.startsWith("assets/"))
        .sort();
      this.emitFile({
        type: "asset",
        fileName: "offline-assets.json",
        source: JSON.stringify(assets),
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    offlineManifestPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/qsak.svg"],
      manifest: {
        name: "qsak — конвертер файлов",
        short_name: "qsak",
        description: "Конвертация и проверка файлов прямо на вашем устройстве",
        theme_color: "#6ea8dc",
        background_color: "#f5f9fd",
        display: "standalone",
        icons: [
          {
            src: "icons/qsak.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
        // Прекэшируем только лёгкий каркас приложения (~350 КБ); WASM-кодеки кэшируются по мере использования или по кнопке
        globPatterns: [
          "index.html",
          "manifest.webmanifest",
          "icons/*.svg",
          "assets/index-*.{js,css}",
          "assets/task.worker-*.js",
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.(wasm|mjs|js|css)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "qsak-engines-v1",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: [
      "@jsquash/avif",
      "@jsquash/jpeg",
      "@jsquash/oxipng",
      "@jsquash/png",
      "@jsquash/webp",
      "@resvg/resvg-wasm",
      "@ffmpeg/ffmpeg",
      "@ffmpeg/util",
      "@ffmpeg/core",
      "7z-wasm",
      "libheif-js",
      "pdfjs-dist",
    ],
  },
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      maxParallelFileOps: 2,
    },
  },
});
