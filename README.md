# GanadoPro v48 (Clean Build)
- UI avanzada (sub-scores, precauciones, resumen IA, finanzas y compra).
- API estable (JSON-only) con fallback heurístico si no hay `OPENAI_API_KEY`.
- `package.json` y `vercel.json` mínimos para Vercel.

## Deploy
1) Sube a un repo y conéctalo en Vercel.
2) Variables: `OPENAI_API_KEY` (y opcional `OPENAI_MODEL`, ej. `gpt-4o-mini`).
3) Verifica `/api/health` y luego prueba la app.
