# GanadoPro v58c (ES) — Vercel
- Doble validación de métricas (2 pases + fusión) y tipo racial estimado.
- UI en español, bandas por métrica, fortalezas/debilidades, resumen IA y decisión de compra.
- Listo para Vercel. No fija runtime explícito.

## Deploy rápido
1) Suba este zip a un repo o impórtelo directo en Vercel.
2) Deploy. La raíz sirve `public/index.html`; la API está en `/api`.
3) Pruebe `/api/health` (JSON).
4) Abra la app, cargue una imagen y vea el informe.

> Nota: `api/analyze.js` usa una heurística determinista (demo). Para IA real, reemplace la lógica por su llamada a modelo y agregue `OPENAI_API_KEY` en Vercel.
