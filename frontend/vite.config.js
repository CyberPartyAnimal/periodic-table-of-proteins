import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Sent with every page in development and in production preview.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

// Production only: the dev server needs inline scripts and websockets for hot reload.
// 'unsafe-eval' is required by the 3Dmol.js structure viewer; inline styles by React style props.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://files.rcsb.org https://alphafold.ebi.ac.uk",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

// The frontend talks to the FastAPI backend only through /api on its own origin.
const proxy = { '/api': 'http://localhost:8000' }

// The published site is plain files on a static host (Cloudflare Pages / Netlify), which read headers from
// a `_headers` file. Generate it from the same settings as above so dev, preview and production can't drift.
const staticHostHeaders = () => ({
  name: 'static-host-headers',
  apply: 'build',
  generateBundle() {
    const lines = Object.entries({ ...SECURITY_HEADERS, 'Content-Security-Policy': CONTENT_SECURITY_POLICY })
      .map(([k, v]) => `  ${k}: ${v}`)
    this.emitFile({ type: 'asset', fileName: '_headers', source: ['/*', ...lines, ''].join('\n') })
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), staticHostHeaders()],
  server: { port: 5173, headers: SECURITY_HEADERS, proxy },
  preview: { headers: { ...SECURITY_HEADERS, 'Content-Security-Policy': CONTENT_SECURITY_POLICY }, proxy },
  build: { sourcemap: false },
})
