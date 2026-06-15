# BUG-26 [low] El useEffect de carga del diff depende de source, recreado cada render del padre

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/editor/GitDiffPane.tsx:138-185` (deps `[active, key, source]`)
`src/modules/workspaces/PanelContent.tsx:127-133` (crea `source={{...}}` inline)

## Problema
`source` es un literal de objeto nuevo en cada render de `PanelContent`, por lo que el efecto de carga del diff se re-ejecuta en cada render aunque `key` (un string estable) no cambie. Al re-ejecutarse, lee de cache y hace un `setState` extra (un objeto nuevo), provocando un re-render adicional. No causa refetch (la logica es cache-first mas inflight dedupe) pero si genera churn de efectos y renders.

## Impacto / repro
Re-renders en cascada del diff pane cada vez que el arbol de workspaces se re-renderiza (cualquier cambio de estado en un ancestro). Coste desperdiciado en un subsistema que debe ser ligero. Repro: abrir un git-diff panel, provocar re-renders del arbol (p.ej. redimensionar un pane o cambiar foco) y observar que el efecto de carga del diff se vuelve a correr y emite un setState extra.

## Fix
Quitar `source` de las dependencias del efecto y derivar los primitivos que realmente usa (`source.kind`, `repoRoot`, `path`, `mode`/`sha`, `originalPath`), poniendolos individualmente en las deps. Alternativamente, memoizar `source` en `PanelContent` con `useMemo` sobre esos mismos primitivos para que la identidad del objeto sea estable entre renders.

## Criterios de aceptacion
- El efecto de carga del diff no se re-ejecuta cuando un ancestro re-renderiza sin cambiar la identidad logica del diff (kind, repoRoot, path, mode/sha, originalPath).
- No hay setState extra ni re-render adicional del diff pane en ese escenario.
- El comportamiento de carga (cache-first, inflight dedupe) se mantiene intacto.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar que el diff pane sigue cargando y mostrando el contenido correcto, y que no aparecen renders/efectos redundantes (p.ej. con un log temporal o React DevTools Profiler).

## Test a anadir
No aplica (cambio local de render, no toca subsistema core de IPC/git/fs). Si se memoiza en PanelContent, basta con verificacion manual del Profiler.
