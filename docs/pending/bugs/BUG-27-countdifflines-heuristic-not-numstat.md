# BUG-27 [low] countDiffLines cuenta lineas heuristicamente en lugar de usar numstat real

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/editor/GitDiffPane.tsx:88-100`

## Problema
`countDiffLines` cuenta cualquier linea que empiece por `+` o `-` (excluyendo las cabeceras `++`/`--`) para derivar los contadores de lineas anadidas/eliminadas. Solo se usa en modo fallback. El backend ya entrega `added`/`removed` fiables via numstat (`GitCommitFileChange.added`/`removed`), pero el diff pane no recibe esos valores y los recuenta heuristicamente sobre el patch.

## Impacto / repro
En modo fallback los contadores `+N`/`-M` mostrados en la UI pueden ser ligeramente incorrectos (p.ej. cuando el patch contiene lineas de contexto o casos limite que la heuristica no distingue). UI visible. Repro: abrir un diff en el modo fallback de un fichero cuyo numstat difiere del recuento heuristico y comparar los contadores con `git diff --numstat`.

## Fix
Pasar los stats reales (`added`/`removed` de numstat) al `GitDiffPane` desde el origen de datos (status snapshot o commit files) en lugar de recontar el patch en el cliente. Mantener `countDiffLines` solo como ultimo recurso si no llega numstat, o eliminarlo si siempre hay numstat disponible.

## Criterios de aceptacion
- Los contadores `+N`/`-M` del diff pane coinciden con `git diff --numstat` para el fichero mostrado.
- En modo fallback se usan los valores de numstat cuando estan disponibles.
- No se recuenta el patch en el cliente cuando ya existe numstat.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar que los contadores de un diff conocido coinciden con el numstat real de git.

## Test a anadir
No aplica directamente al subsistema core (el cambio es de cableado de datos hacia la UI). Si se conserva `countDiffLines` como fallback puro, anadir un test unitario que fije su comportamiento sobre un patch con lineas de contexto.
