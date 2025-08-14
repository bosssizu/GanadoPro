# GanadoPro v45 (Vercel-ready)
Estructura lista para desplegar en Vercel:
- `public/index.html` (UI móvil/desktop)
- `api/health.js` y `api/analyze.js` (CommonJS, runtime nodejs, JSON-only)
- `package.json` y `vercel.json`

## Deploy
1) Conecta el repo a Vercel.
2) Variables: `OPENAI_API_KEY` (y opcional `OPENAI_MODEL`, ej. `gpt-4o-mini`).
3) Sin build step. Verifica `/api/health` y luego prueba el flujo en `/`.
