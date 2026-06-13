# BUG-21 [low · perf] WorkspaceRegistry crece sin cota y is_authorized es O(n)

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src-tauri/src/modules/workspace.rs:19-35`

## Problema
El `HashSet` del registry solo inserta, nunca purga. Cada `cd` distinto anade un root permanente, e `is_authorized` hace `iter().any(starts_with)`, es decir O(n) en hot paths de git/watch.

## Impacto / repro
Crecimiento monotono de memoria y coste lineal creciente por cada chequeo de autorizacion, en rutas calientes. Contrario a la filosofia ultraligera.

Repro: navegar (cd) por muchos directorios distintos a lo largo de una sesion larga. Observar que el registry crece sin limite y que cada chequeo `is_authorized` recorre todos los roots.

## Fix
Capar el registry con una politica LRU y consolidar roots ancestro/descendiente al insertar (si se inserta un ancestro de un root existente, colapsar; si se inserta un descendiente de un root existente, no anadir duplicado). Ver spec en `review/improvements/M6-reaping-bg-procs-y-registry.md`.

## Criterios de aceptacion
- El registry tiene una cota maxima de entradas (LRU descarta las menos usadas).
- Insertar un root que es ancestro de roots existentes los consolida; insertar un descendiente de un root ya autorizado no anade entrada redundante.
- `is_authorized` sigue siendo correcto (autoriza exactamente los paths cubiertos por algun root).

## Verificacion
Rust: `cd src-tauri && cargo clippy && cargo test --locked`. Verificar correctitud de la consolidacion y de la cota LRU.

## Test a anadir
Subsistema core (workspace auth). Anadir tests Rust para: consolidacion ancestro/descendiente al insertar, cota LRU (descarte de la entrada menos usada al superar el limite) y correctitud de `is_authorized` tras consolidacion.
