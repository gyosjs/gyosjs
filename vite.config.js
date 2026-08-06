import { defineConfig } from 'vite';

export default defineConfig({
  root: './examples',
  server: {
    port: 3000,
    open: true
  },
  resolve: {
    alias: {
      'gyosjs': '../dist/gyos.esm.js'
    }
  }
});
