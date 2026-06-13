# BUG-16 [medium · leak] WindowControls fuga el listener onResized en unmount rapido

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/components/WindowControls.tsx:21-34`

## Problema
`w.onResized(...)` devuelve una `Promise`; la variable `unlisten` solo se asigna tras resolver la promesa. Si el componente se desmonta antes de que resuelva, el cleanup `return () => unlisten?.()` corre con `unlisten` aun `undefined` y el listener queda registrado para siempre (fuga). Ademas, el icono maximize/restore solo se actualiza via el round-trip de `onResized`, evento que algunos compositores (Linux CSD, ciertos WM) no emiten de forma fiable.

## Impacto / repro
HMR/remount en dev o churn rapido de ventana fuga listeners de `onResized` acumulativamente. El icono restore queda ocasionalmente obsoleto cuando el compositor no emite el evento.

Repro: forzar remount rapido del componente (HMR) y observar listeners acumulados; o maximizar/restaurar en un compositor que no emite `onResized` y ver el icono desincronizado.

## Fix
```ts
let cancelled = false;
let unlisten: (() => void) | undefined;
w.onResized(...).then((un) => {
  if (cancelled) un();
  else unlisten = un;
});
return () => {
  cancelled = true;
  unlisten?.();
};
```
Ademas, setear el estado `maximized` explicitamente justo despues de `toggleMaximize()` en lugar de depender unicamente del evento `onResized`.

## Criterios de aceptacion
- Desmontar el componente antes de que `onResized` resuelva no deja listeners colgando (se cancela y se llama a `un()`).
- El icono maximize/restore refleja el estado correcto inmediatamente tras `toggleMaximize()`, sin esperar al evento del compositor.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Verificar manualmente en Linux/Windows (donde se renderiza `WindowControls`) que el icono cambia al maximizar/restaurar y que el remount rapido no fuga listeners.

## Test a anadir
No aplica (componente de UI dependiente de la ventana Tauri, dificil de testear unitariamente). Si se desea, un test que mockee `onResized` con una promesa pendiente y verifique que el cleanup tras unmount llama a `un()` cuando resuelve.
