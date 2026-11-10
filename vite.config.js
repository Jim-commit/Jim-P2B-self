import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        platform: resolve(__dirname, 'platform.html'),
        hq: resolve(__dirname, 'hq.html'),
        mall: resolve(__dirname, 'mall.html'),
        driver: resolve(__dirname, 'driver.html')
      }
    }
  }
});
