# BUG-SP-01: volver a un pane con el raton no reabre el scratchpad (remember ON)

Estado: pendiente de reproducir con proceso fresco (reportado 2026-07-06, ronda de pruebas en vivo).

## Sintoma

Con `scratchpadRememberFocus` activado: cambiar de pane por TECLADO y volver reabre el scratchpad
correctamente. Cambiar de pane con el RATON (clicando el terminal del otro pane) y volver clicando el
terminal del pane original NO reabre el scratchpad ("se pierde el foco en SP").

## Contexto

El comportamiento esperado (decidido 2026-07-04) es que un focusin en el terminal de un leaf NO enfocado
cuenta como cambio de pane y respeta la marca de resume; el dismiss queda solo para el click en el
terminal del leaf YA enfocado. Implementado en el guard `!s.focusedNow` de `setLeafTerminalFocused`
(`src/modules/terminal/lib/useTerminalSession.ts`), commit `47f2a36`. La review estatica verifico el
timing (xterm enfoca en el mousedown, antes del commit de React, con `focusedNow` aun false).

## Pistas

- La sesion de pruebas del 2026-07-06 corrio sobre un `pnpm tauri dev` que habia hot-recargado varios
  commits (R8-R10); el gotcha de HMR sobre `useTerminalSession.ts` (estado a nivel de modulo duplicado)
  produce exactamente este tipo de sintoma fantasma. PRIMER PASO: matar el proceso y reproducir con
  arranque fresco antes de investigar nada.
- Si se reproduce con proceso fresco: revisar si el mousedown en el terminal de OTRO pane dispara algun
  camino de dismiss no contemplado (p. ej. `PaneView.handleActivate` con `requestLeafFocus` sincrono, o
  un orden de eventos distinto al trazado en `docs/SCRATCHPAD.md` seccion de timing).

## Donde tocar / que probar despues

Ver `docs/SCRATCHPAD.md` (invariante `requestLeafFocus`, mapa de cierres, timing focusedNow) y el
checklist de verificacion. La prueba minima: flag ON, SP enfocado en pane A, click en terminal de pane B,
click en terminal de pane A. Esperado: SP de A reabre enfocado. Teclado (`Cmd+Ctrl+Flecha`) ida y vuelta
debe seguir funcionando igual.
