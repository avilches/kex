# BUG-04 [high] El editor del diff se reconstruye por completo en cada cambio de contenido y de tema

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/editor/GitDiffPane.tsx:202-218` (extensions/memo), tema en `src/modules/editor/GitDiffPane.tsx:309`.

## Problema
`extensions` se memoiza con deps `[originalContent, initialLang]` y `unifiedMergeView({ original: originalContent, ... })` vive dentro de ese array. `@uiw/react-codemirror` recrea el `EditorState` completo cuando el array cambia de identidad; `originalContent` puede ser de hasta 2 MB. `themeExt` (prop `theme`) no esta en deps, pero al cambiar de tema fuerza otra reconstruccion completa. No se usan compartments para original/tema (si existe `languageCompartment`).

## Impacto / repro
Cambiar el tema con un diff grande abierto congela el frame; abrir diffs reconstruye el state. Paron perceptible en ficheros de cientos de KB.

## Fix
Se resuelve de forma natural migrando a `MergeView` (ver `docs/pending/features/F1-diff-side-by-side.md`): gestionar los docs via `dispatch` y el tema via un `Compartment` reconfigurable, sin recrear el `EditorState`. Si se mantiene `unifiedMergeView` temporalmente, mover `themeExt` a un compartment para que cambiar de tema solo dispare un `reconfigure` en lugar de reconstruir todo el state.

## Criterios de aceptacion
- Cambiar de tema con un diff grande abierto no reconstruye el `EditorState` (sin paron de frame perceptible).
- El contenido original y modificado se actualiza via dispatch/compartment, no recreando el state.
- El resaltado de cambios sigue siendo correcto tras cambiar tema.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar manualmente que cambiar de tema con un diff de cientos de KB no congela el frame.

## Test a anadir
No aplica (no es subsistema core Rust). Cobertura recomendada: render del pane con cambio de tema sin recreacion de state, si la infraestructura de test del editor lo permite.
