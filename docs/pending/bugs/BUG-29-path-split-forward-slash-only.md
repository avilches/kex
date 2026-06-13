# BUG-29 [low · cross-platform] dirname/ArrowLeft/createTarget y el editor parten por "/" en vez de /[\\/]/

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/explorer/FileExplorer.tsx:324`
`src/modules/explorer/TreeRow.tsx:71`
`src/modules/explorer/lib/useFileTree.ts` (`dirname`)
`src/modules/editor/EditorPane.tsx:276,301`

## Problema
AGENTS.md exige normalizar separadores con `.split(/[\\/]/)`. Estos sitios usan `lastIndexOf("/")` o `split('/')`. El canonical form del frontend es forward-slash y suele ser seguro, pero `panel.cwd` y paths derivados de OSC en Windows pueden llevar backslash, dando el directorio padre equivocado (ArrowLeft collapse, rename parent, target de New File/New Folder) y el filename equivocado en el editor.

## Impacto / repro
En Windows, con paths que contienen backslash, la navegacion y el calculo de target computan el directorio equivocado: ArrowLeft no colapsa al padre correcto, el rename apunta al parent equivocado, New File/Folder se crea en el sitio equivocado, y el editor muestra el filename equivocado. Repro: en Windows abrir un path con backslash y ejecutar cualquiera de esas acciones.

## Fix
Helper compartido que parta por `/[\\/]/` para todo derivado de parent/basename (espejo de `watch.ts:parentDir`). Reemplazar los `lastIndexOf("/")` y `split('/')` de los sitios listados por ese helper.

## Criterios de aceptacion
- `dirname`/parent y basename funcionan con separadores `/` y `\\` indistintamente.
- ArrowLeft collapse, rename parent y New File/Folder target apuntan al directorio correcto con paths backslash.
- El editor deriva el filename correcto con paths backslash.
- Existe un unico helper compartido para parent/basename (no duplicado por sitio).

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar que el helper trata `a\\b\\c` igual que `a/b/c` para parent y basename.

## Test a anadir
Anadir test unitario del helper de parent/basename que cubra inputs con `\\`, con `/`, mixtos, y casos limite (raiz, sin separador). El subsistema (explorer/path handling) es sensible cross-platform, conviene fijar el invariante.
