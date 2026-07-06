# IMP-SP-02: catalogo de pruebas con codigo para los invariantes del scratchpad

Estado: pendiente (pedido por el usuario 2026-07-06).

## Objetivo

Convertir el checklist de verificacion de `docs/SCRATCHPAD.md` en un catalogo de casos de prueba
manuales, cada uno con: codigo identificador estable (SP-XX), pasos reproducibles exactos, resultado
esperado, y punteros al codigo que implementa ese comportamiento. Asi, al tocar cualquier parte del
subsistema, el agente sabe que casos re-probar y como, sin tener que redactar las instrucciones cada vez.

Regla de mantenimiento: cada vez que se añada o cambie un camino de foco/cierre del scratchpad, se añade
o actualiza su caso SP-XX en el catalogo, en el mismo commit (politica de documentacion viva).

## Borrador del catalogo (validado parcialmente en vivo el 2026-07-06)

Precondicion comun: `pnpm tauri dev` FRESCO (nunca fiarse de sesiones con HMR sobre
`useTerminalSession.ts`). "Flag ON/OFF" = Settings > Terminal > Remember scratchpad focus.

- SP-01 (flag ON) Cambio de pane por teclado: abrir SP (Cmd+U), Cmd+Ctrl+Flecha a otro pane, volver
  igual. Esperado: al salir el SP se cierra; al volver reabre enfocado.
  Codigo: `leaveActivePaneScratchpad` (App.tsx), efecto de transicion + `requestLeafFocus`
  (useTerminalSession.ts). RESULTADO 2026-07-06: PASA.
- SP-02 (flag ON) Cambio de pane con raton: abrir SP en pane A, click en el TERMINAL de pane B, click en
  el TERMINAL de pane A. Esperado: SP de A reabre enfocado.
  Codigo: guard `!s.focusedNow` en `setLeafTerminalFocused`. RESULTADO 2026-07-06: FALLA (ver
  BUG-SP-01; pendiente re-probar con proceso fresco).
- SP-03 (flag ON) Dismiss por click: con SP enfocado, click en el terminal DEL MISMO tab. Esperado: SP se
  cierra; salir del tab y volver NO lo reabre (el dismiss borra la memoria).
  Codigo: `setLeafTerminalFocused` rama focusedNow=true.
- SP-04 (flag ON) Script en otro pane: SP enfocado en tab A; ejecutar un script cuyo tab vive (o se abre)
  en OTRO pane. Esperado: el tab del script se muestra en su pane y el comando corre, pero el foco y el SP
  se quedan en A sin parpadear. RESULTADO 2026-07-06: PASA.
  Codigo: `revealTab` (useWorkspaces.ts) + rama different-pane de `runWorkspaceConfig` (App.tsx).
- SP-05 (flag ON) Script en el MISMO pane: configurar un script cuyo `tabId` sea un tab del pane donde
  estas (o forzar el fallback atLimit: alcanzar el limite de panes y ejecutar un script sin pane propio).
  Pasos: SP enfocado en tab A del pane P; ejecutar ese script. Esperado: el tab del script se activa en P
  (tapa a A, inevitable: un pane muestra un tab) y el foco va al terminal del script; al volver al tab A,
  su SP reabre enfocado (la marca sobrevive).
  Codigo: rama same-pane de `runWorkspaceConfig`/`stopWorkspaceConfig` (App.tsx, commit 54bad6f).
- SP-06 Parar script de OTRO workspace: script corriendo cuyo tab vive en otro workspace; pararlo desde
  donde estes. Esperado: salta a ese workspace y enfoca el tab del script (simetrico con ejecutar).
  Codigo: rama else de `stopWorkspaceConfig` (commit 6a5b335).
- SP-07 (flag ON) Caminos con .focus() reconvertidos (commit bcecde1), un caso por camino:
  a) Abrir carpeta en terminal (menu contextual del explorer sobre un directorio > abrir en terminal).
     Esperado: el tab nuevo recibe foco coherente con su SP (si `scratchpadInNewTerminals` esta ON, el SP
     del tab nuevo aparece enfocado; si OFF, cursor en el terminal).
  b) Nuevo workspace desde carpeta. Esperado: igual que (a) en el primer tab del workspace nuevo.
  c) Insertar un comando desde el historial (UI de historial > insertar). Esperado: el foco vuelve al
     leaf respetando su estado de SP.
  d) Busqueda inline (Cmd+F) sobre un terminal, cerrarla (Esc). Esperado: el foco vuelve al leaf
     respetando su SP (con SP abierto antes de la busqueda + flag ON: reabre).
  Codigo: los 4 call sites de `requestLeafFocus` en App.tsx añadidos en bcecde1.
- SP-08 Smoke del modelo binario (flag OFF): Escape cierra y enfoca terminal; Cmd+U alterna; Enter envia
  y el SP sigue abierto; cambiar de tab/pane/workspace cierra y al volver el cursor esta en el terminal
  (el SP NO reabre); RunButton/OpenInEditorButton/campana cierran el SP y al cerrarse el chrome el foco
  cae en el terminal; click en el workspace activo restaura el foco.
  Codigo: modelo binario completo (docs/SCRATCHPAD.md).
- SP-09 (flag ON) Interrupciones de chrome: SP enfocado, abrir y cerrar la campana / el dropdown del
  RunButton / el de OpenInEditorButton / un dialogo. Esperado: al cerrarse, el SP reabre enfocado.
  Codigo: `restoreLeafFocus` + onCloseAutoFocus de cada chrome.
- SP-10 Cmd+Tab / ventana Settings (macOS): SP enfocado, salir y volver a la app; abrir y cerrar la
  ventana de Settings. Esperado: el SP sigue abierto y recupera el foco.
  Codigo: `onFocusChanged` (App.tsx). Nota plataforma: en Windows/Linux (Chromium) el blur con
  relatedTarget null puede divergir; ver riesgo F3 en el historial.

## Tarea

1. Pulir este borrador e integrarlo en `docs/SCRATCHPAD.md` sustituyendo el checklist actual (o como
   seccion "Test catalog" enlazada desde el), en ingles, con los codigos SP-XX estables.
2. Revisar el catalogo contra el codigo real (cada puntero) antes de commitear.
3. Re-ejecutar en vivo los casos que quedaron sin validar el 2026-07-06: SP-02 (tras resolver BUG-SP-01),
   SP-05, SP-06, SP-07 (a-d), SP-09, SP-10.
