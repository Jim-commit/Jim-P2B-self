import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        join: resolve(__dirname, 'join.html'),
        hq: resolve(__dirname, 'hq.html'),
        platform: resolve(__dirname, 'platform.html'),
        driver: resolve(__dirname, 'driver.html')
      }
    }
  }
});
