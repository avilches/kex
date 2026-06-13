# BUG-30 [low · UX] Las mutaciones fs y el autosave tragan errores (solo console.error)

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/explorer/lib/useFileTree.ts:308,343,359`
`src/modules/editor/lib/useDocument.ts:149`

## Problema
Las operaciones create/rename/delete y el autosave, cuando fallan, solo hacen `console.error`. La fila pendiente se descarta en el `finally`, asi que la operacion desaparece de la UI sin ningun feedback al usuario (permiso denegado, colision de nombre). El autosave fallido es completamente invisible.

## Impacto / repro
El usuario renombra a una ruta con colision de nombre, o el autosave da contra un fichero read-only, y no se entera de que la operacion fallo. Viola la barra de UX premium y la regla de no tragar fallos. Repro: renombrar un fichero a un nombre ya existente, o editar un fichero read-only y esperar al autosave; observar que no hay feedback visible (solo log en consola).

## Fix
Surfacing del error via el toast Sonner que ya esta cableado en la app (`toast.error(...)`), con un mensaje claro de la operacion que fallo y el motivo. Mantener tambien el `console.error` para diagnostico si se desea.

## Criterios de aceptacion
- Un create/rename/delete fallido muestra un toast de error con un mensaje accionable.
- Un autosave fallido muestra un toast de error (no queda silencioso).
- El mensaje distingue el motivo cuando es posible (permiso, colision de nombre).
- No se rompe el flujo normal de exito (sin toasts espurios).

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar manualmente que renombrar a un nombre ya existente y un autosave sobre read-only producen un toast de error.

## Test a anadir
No aplica al core (es cableado de UI/feedback). Verificacion manual de los toasts en los escenarios de fallo.
