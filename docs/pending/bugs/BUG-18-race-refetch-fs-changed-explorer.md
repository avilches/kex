# BUG-18 [medium] Race de refetch fs:changed en el explorer: estado de directorio obsoleto puede aplicarse

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/explorer/lib/useFileTree.ts:191-211` (listenFsChanged) + `:105-157` (fetchChildren)

## Problema
`listenFsChanged` dispara `fetchChildren(d)` por cada directorio cambiado. `fetchChildren` lee `nodesRef.current`, que esta sincronizado por un effect y por tanto va un commit por detras. Con dos eventos para el mismo directorio muy seguidos (o un refresh manual solapado), no hay token in-flight por path: gana el ultimo `invoke` que resuelve, no el mas nuevo. El resultado mas reciente puede ser pisado por uno mas antiguo que resuelve despues.

## Impacto / repro
Mucha actividad de ficheros (npm install, build, generadores) puede mostrar momentaneamente un listado de directorio obsoleto en el explorer.

Repro: abrir el explorer sobre un directorio que recibe escrituras rapidas (ej. `npm install` poblando `node_modules`, o un build que crea/borra muchos ficheros). Observar que el listado puede quedar momentaneamente desfasado respecto al estado real del FS.

## Fix
Introducir un token de secuencia por path: `Map<string, number>`. Al lanzar un `fetchChildren(path)`, incrementar y capturar el token; al resolver, aplicar `setNodes` solo si el token capturado sigue siendo el actual para ese path. Leer el estado fresco dentro del updater de `setNodes` en lugar de `nodesRef.current`.

## Criterios de aceptacion
- Dos `fetchChildren` solapados para el mismo path: solo el mas reciente aplica su resultado.
- El estado del directorio se lee fresco dentro del updater, no de un ref con un commit de retraso.
- Bajo actividad intensa de ficheros, el listado converge al estado real sin mostrar versiones obsoletas de forma persistente.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Verificar con eventos `fs:changed` rapidos para el mismo path que el resultado obsoleto que resuelve tarde no pisa al mas nuevo.

## Test a anadir
Subsistema core (explorer / file tree). Anadir un test que simule dos `fetchChildren` para el mismo path resolviendo en orden invertido (el antiguo resuelve despues) y verifique que `setNodes` aplica solo el resultado del token mas reciente.
