# BUG-03 [high · perdida de datos] El timer de autosave se pierde al desmontar: edits silenciosamente descartados

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/editor/lib/useDocument.ts:148-156`

## Problema
`onChange` arma un `setTimeout` de autosave con debounce. El unico cleanup (`useEffect(() => clearAutoSaveTimer, [path, clearAutoSaveTimer])`) limpia el timer pendiente en unmount pero nunca hace flush del buffer sin guardar. No hay `beforeunload` ni flush-on-close. Los paneles normalmente quedan montados (ocultos) pero SI se desmontan al cerrar el tab.

## Impacto / repro
Escribir en un fichero con autosave activo y cerrar el tab dentro de la ventana de debounce descarta la escritura pendiente sin aviso. Viola el liston de "no swallowed failures".

## Fix
En el cleanup, si `dirtyRef.current` es true, hacer flush (`saveNow().catch(...)`) antes de limpiar el timer. Aplicar el mismo flush al cambiar de `path` (no solo en unmount), para que cambiar de fichero no pierda el buffer pendiente.

Esquema:
```ts
useEffect(() => {
  return () => {
    if (dirtyRef.current) {
      saveNow().catch((e) => { /* log, no swallow */ });
    }
    clearAutoSaveTimer();
  };
}, [path, clearAutoSaveTimer, saveNow]);
```

## Criterios de aceptacion
- Editar y cerrar el tab dentro de la ventana de debounce persiste el contenido.
- Cambiar de `path` con un buffer dirty hace flush del anterior antes de cambiar.
- Un fallo de guardado en flush no se traga en silencio (se registra).

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar el test de flush-on-unmount.

## Test a anadir
No aplica como invariante de subsistema core, pero se recomienda un test del hook que verifique flush cuando el buffer esta dirty en unmount y en cambio de path.
