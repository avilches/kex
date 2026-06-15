# BUG-07 [high] split_name_status_numstat usa una heuristica TAB fragil que falla con binarios/merges

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src-tauri/src/modules/git/operations.rs:681-703`

## Problema
El split entre el bloque `--name-status` y `--numstat` se hace buscando el primer token con `\t`. Si no hay ningun token con TAB (o el primero con TAB no es el limite real, por ejemplo un numstat binario `-\t-\t`), `split_at` cae a `bytes.len()` y todo se interpreta como name-status, dejando numstat vacio.

## Impacto / repro
`apply_numstat` no encuentra contadores: `added`/`removed` quedan en 0 para algunos ficheros en la vista de commit. Es un fallo visual, no corrupcion de datos.

## Fix
Emitir name-status y numstat en dos invocaciones separadas de `diff-tree` (`--name-status -z` y `--numstat -z`) y correlacionar por path. Elimina la heuristica del TAB por completo.

## Criterios de aceptacion
- Los contadores `added`/`removed` son correctos para ficheros de texto, binarios y merges.
- No se depende de buscar el primer TAB para separar bloques.
- La vista de commit muestra los contadores correctos en commits con binarios.

## Verificacion
Rust: `cd src-tauri && cargo clippy && cargo test --locked`. Comprobar el nuevo test de correlacion name-status/numstat.

## Test a anadir
Subsistema core git. Anadir test con un commit que mezcle un fichero de texto y uno binario (numstat `-\t-`); verificar que name-status y numstat se correlacionan por path y que los contadores del fichero de texto son correctos y el binario no rompe el parseo.
