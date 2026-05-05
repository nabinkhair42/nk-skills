import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://skills.nabinkhair.com.np",
  markdown: {
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    },
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    assetsInclude: ["**/*.sh"],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
  },
});
