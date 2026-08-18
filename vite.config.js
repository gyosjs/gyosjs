import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const cspHeader = [
  "default-src 'self'",
  "script-src 'nonce-gyos-e2e' 'strict-dynamic'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'"
].join('; ');

const strictCspFixtures = {
  name: 'gyos-strict-csp-fixtures',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split('?', 1)[0];
      if (pathname === '/csp.html' || pathname === '/csp-next.html') {
        response.setHeader('Content-Security-Policy', cspHeader);
		response.setHeader('Content-Type', 'text/html; charset=utf-8');
		response.end(readFileSync(new URL(`./examples${pathname}`, import.meta.url)));
		return;
      }
	  if (pathname === '/gyos-dist/gyos.csp.auto.min.js') {
		response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
		response.end(readFileSync(new URL('./dist/gyos.csp.auto.min.js', import.meta.url)));
		return;
	  }
	  if (pathname === '/gyos-dist/gyos.css') {
		response.setHeader('Content-Type', 'text/css; charset=utf-8');
		response.end(readFileSync(new URL('./dist/gyos.css', import.meta.url)));
		return;
	  }
      next();
    });
  }
};

export default defineConfig({
  root: './examples',
  plugins: [strictCspFixtures],
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
