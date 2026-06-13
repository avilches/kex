# BUG-35 [low] usePresence re-ejecuta el efecto al auto-actualizar mounted (re-entrancy latente)

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/lib/usePresence.ts:15-28`

## Problema
`mounted` esta en las dependencias del efecto, asi que el efecto del close-timer se re-dispara cuando el propio timer setea `mounted=false`. Es correcto hoy, pero el efecto corre dos veces por cada cierre y re-armar logica durante la ventana de salida (exit window) es fragil ante futuros cambios.

## Impacto / repro
Comportamiento correcto hoy, fragilidad latente: el efecto se ejecuta dos veces por cierre y la re-entrancy podria causar bugs sutiles si se anade logica al efecto. No hay repro visible al usuario actualmente.

## Fix
Quitar `mounted` de las dependencias del efecto y trackear el `mounted` actual via un `ref`, de modo que el efecto solo se arme en transiciones de `open` y no se re-dispare cuando el timer cambia `mounted`.

## Criterios de aceptacion
- El efecto del close-timer solo se arma en transiciones de `open` (no al cambiar `mounted` internamente).
- La animacion de salida (exit window) sigue funcionando igual: `mounted` pasa a false tras el timeout y el componente se desmonta cuando corresponde.
- No hay doble ejecucion del efecto por cierre.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar manualmente (o con un log temporal) que el efecto se arma una sola vez por transicion de `open` y que la animacion de salida no se rompe.

## Test a anadir
No aplica al core. Verificacion manual del ciclo abrir/cerrar y de que la animacion de salida se completa sin parpadeos.
