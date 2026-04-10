import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html', // Replace with your primary entry point file (e.g., index.html)
        simulator: 'src/thermostat-simulator/index.html',
      },
    }
  },
});
