# GanadoPro v58g (ES) — Vercel
Corrección crítica: JSON garantizado desde `/api/analyze` (se sustituyó `or` por `||` en veredicto).

## Novedades
- Doble validación (2 pasadas) + gating estricto (BCS<2.8 o ≥3 métricas “Malo”).
- Debilidades siempre presentes; tipo racial estimado.
- UI en español con bandas por métrica.
- En errores, la API devuelve **JSON** con `detail` (stack).

## Deploy
Importa el ZIP en Vercel. Prueba `/api/health` y luego la UI.
