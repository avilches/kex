# BUG-36 [low · blocks/UI] El menu de acciones de un bloque desaparece cuando el bloque es muy largo

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/terminal/block/BlockOverlay.tsx` (componentes `BlockChrome`, `StickyHeader`, `Toolbar`, `BlockMenu`) y la geometria que las posiciona en `src/modules/terminal/block/lib/blockDecorations.ts` (`visibleBlocks`, calculo de `headerTop` y `sticky`).

## Problema
El chrome de cada bloque (la `bt-bar` con `Meta` + `Toolbar` + dropdown `BlockMenu`) se ancla a `headerTop`, una linea por encima del comando. Cuando un bloque es mas alto que el viewport y el usuario se desplaza hacia el medio/final de su salida, el header del bloque queda por encima del viewport y la `bt-bar` no se renderiza, asi que el menu de acciones "..." deja de ser accesible. El `StickyHeader` cubre el caso de un bloque que empieza arriba y se extiende hacia el viewport, pero su Toolbar es la misma y el caso de bloques muy largos no esta del todo cubierto (p.ej. al tener el dropdown abierto y hacer scroll, el trigger puede desmontarse y Radix cierra el menu).

## Impacto / repro
Repro: en una terminal en modo blocks, ejecutar un comando con salida muy larga (mas alta que la ventana), hacer scroll hacia el interior del bloque y intentar abrir/usar el menu "..." de ese bloque. El menu no aparece o se cierra al hacer scroll.

## Fix (a decidir)
Opciones a evaluar: (1) asegurar que el `StickyHeader` de un bloque largo siempre expone el Toolbar/menu mientras cualquier parte del bloque sea visible; (2) mantener el dropdown abierto de forma estable durante scroll (que el trigger no se desmonte mientras el menu de Radix esta abierto, p.ej. fijando el menu a nivel de pane y no por-bloque); (3) reanclar el menu a un punto siempre visible del bloque seleccionado.

## Criterios de aceptacion
- Con un bloque mas alto que el viewport, el menu de acciones sigue siendo accesible mientras cualquier parte del bloque este visible.
- Abrir el dropdown y hacer scroll no lo cierra inesperadamente.
- Bloques cortos siguen comportandose igual que ahora.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Checkpoint visual en una terminal blocks con salida larga (kill + `pnpm tauri dev` fresco; blocks usa estado mutable a nivel de modulo y HMR no es fiable).

## Test a anadir
Si se introduce logica pura para decidir la visibilidad del sticky/menu de un bloque largo, fijarla con un test en `blockDecorations.test.ts` (geometria de `visibleBlocks`/`sticky` con un bloque cuyo rango excede `rows`).
