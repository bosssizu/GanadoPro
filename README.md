# GanadoPro v58f (ES) — Vercel
- Doble validación (2 pasadas) + **gating estricto**: bloquea “Bueno/Excelente” si **BCS < 2.8** o hay **≥3 métricas “Malo”**.
- Debilidades siempre presentes; resumen IA en español; tipo racial estimado.
- UI móvil-first con bandas por métrica.
- Listo para Vercel (rutas en `vercel.json`).

## Deploy
1) Importa el ZIP en Vercel o súbelo a un repo y conéctalo.
2) Abre `/api/health` (JSON).
3) Carga una imagen en `/`.

> Nota: `api/analyze.js` es heurístico (demo). Para IA real, sustituye la lógica por tu llamada de modelo y fija `OPENAI_API_KEY`.
