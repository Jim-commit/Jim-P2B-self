import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        hq: resolve(__dirname, 'hq.html'),
        driver: resolve(__dirname, 'driver.html'),
      },
    },
  },
});