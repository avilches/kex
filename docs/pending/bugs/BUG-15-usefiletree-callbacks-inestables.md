# BUG-15 [medium · perf] useFileTree devuelve objeto y callbacks inestables, memo roto, re-walk del arbol en cada keystroke

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/explorer/lib/useFileTree.ts:365-382` (return), `:349`, `:362` (callbacks)
`src/modules/explorer/FileExplorer.tsx:162` (options inline), `:170-173` (memo dep tree)

## Problema
El hook `useFileTree` retorna un objeto literal nuevo en cada render. `FileExplorer` pasa `{ onPathRenamed, onPathDeleted }` como objeto fresco, de modo que `commitRename`/`deletePath` se recrean en cada render. El `useMemo` de `buildRows` lista `tree` (objeto inestable) como dependencia, por lo que el walk recursivo completo del arbol se ejecuta en cada keystroke o cambio de seleccion, y el `React.memo` de `EntryRow` nunca acierta porque sus props derivadas cambian.

## Impacto / repro
En un arbol grande expandido, teclear en el campo de busqueda o mover la seleccion con el teclado re-camina todo el arbol en cada render. Contrario a la filosofia ultraligera: CPU desperdiciada y posibles jank con muchos nodos.

Repro: abrir el explorer en un repo grande, expandir varios directorios, teclear rapido en busqueda o mover la seleccion con flechas. Observar en el profiler que `buildRows` se recomputa y `EntryRow` se re-renderiza completo en cada pulsacion.

## Fix
- Memoizar el objeto `options` en `FileExplorer` (con `useMemo` sobre `onPathRenamed`/`onPathDeleted` estables).
- Guardar `options` en un `ref` dentro del hook para que los callbacks (`commitRename`, `deletePath`) sean estables y no dependan del objeto.
- Envolver el `return` del hook en `useMemo` para que el objeto retornado sea estable mientras sus valores no cambien.

## Criterios de aceptacion
- El objeto retornado por `useFileTree` es referencialmente estable entre renders cuando su contenido no cambia.
- `commitRename` y `deletePath` no se recrean en cada render.
- `buildRows` no se recomputa al teclear en busqueda ni al mover la seleccion si el arbol no ha cambiado.
- El `React.memo` de `EntryRow` evita re-render de filas sin cambios.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar con React Profiler que teclear en busqueda no dispara `buildRows` ni re-render masivo de `EntryRow`.

## Test a anadir
No aplica directamente (no es subsistema core con invariante testable de forma unitaria sencilla). Si se desea, anadir un test que verifique que la referencia del objeto retornado por `useFileTree` se mantiene estable entre renders sin cambios de estado.
