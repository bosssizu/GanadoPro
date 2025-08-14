# GanadoPro v57b (ES) — Vercel
- App en español, métricas morfológicas con bandas de color, resumen robusto, compra/no compra y rango CRC/kg.
- Listo para Vercel. No fija runtime (evita error de versiones).

## Deploy rápido
1) Suba este repo a GitHub o impórtelo directo en Vercel.
2) Deploy. La raíz sirve `public/index.html`; la API está en `/api`.
3) Verifique `/api/health` (debe responder JSON).
4) Abra la app, cargue una imagen y vea el informe.

> Nota: `api/analyze.js` usa una heurística determinista (demo). Si desea usar OpenAI, reemplace el cuerpo por su llamada y configure `OPENAI_API_KEY` en Vercel.
