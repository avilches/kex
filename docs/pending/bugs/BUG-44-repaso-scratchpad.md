---
id: BUG-44
title: Repaso del scratchpad (toggle, switch enter=send, boton send, drag de paths)
area: terminal / scratchpad
severity: high
status: por hacer
---

## Descripcion

Repaso urgente de la barra de scratchpad (`src/modules/terminal/ScratchpadBar.tsx`). Hay varios
problemas funcionales y de UI, mas una mejora de productividad pedida.

## Items

### 1. El switch Enter=Send no funciona

El `Switch` (`scratchpad-enter-sends`) parece no aplicar el cambio de comportamiento. Verificar el
flujo: `onCheckedChange` -> `setTerminalScratchpadEnterSends` (store) -> `usePreferencesStore` ->
`enterSends` en `handleKeyDown`. Reproducir si al alternar el switch el envio con Enter / Shift+Enter
no cambia (posible estado que no propaga, o lectura stale de la preferencia).

### 2. El boton Send no tiene fondo

Hoy el boton es un boton de accion plano (`text-muted-foreground hover:text-foreground`), sin fondo,
lo que no comunica que es la accion primaria. Darle el tratamiento de boton primario (fondo + estado
disabled coherente) sin romper la altura `h-[22px]` ni la alineacion del switch contiguo.

### 3. Cmd+U debe cerrar el scratchpad igual que Esc

`terminal.scratchpad` (default Cmd+U en mac) invoca `cycleScratchpad`, que nunca cierra: si la barra
esta abierta solo alterna el foco entre terminal y textarea. Esperado: Cmd+U cierra la barra (mismo
comportamiento que Escape, que llama a `closeScratchpad`). Decidir si Cmd+U pasa a ser un toggle real
(abrir/cerrar) o si conserva el ciclo de foco y se cierra desde el textarea. La intencion del usuario
es que cierre.

### 4. Arrastrar un fichero o carpeta inserta su path relativo

Mejora: soltar (drag and drop) un fichero o carpeta sobre el textarea debe insertar su path relativo
al cwd del terminal en la posicion del cursor. Manejar el `onDrop` / `onDragOver` del textarea,
resolver el path relativo respecto a `panel.cwd` (normalizar separadores, ver convenciones de path en
AGENTS.md), y soportar tanto arrastre desde el explorer interno como desde el SO si aplica.

## Referencias

- `src/modules/terminal/ScratchpadBar.tsx` (UI, switch, boton, keydown).
- `src/modules/terminal/lib/useTerminalSession.ts` (`cycleScratchpad`, `closeScratchpad`, drafts y foco).
- `src/modules/shortcuts/shortcuts.ts` (`terminal.scratchpad`, default Cmd+U en mac).
- `src/modules/settings/store.ts` (`setTerminalScratchpadEnterSends`, `scratchpadEnterSends`).

## Pendiente

- Reproducir y arreglar 1, 2 y 3.
- Disenar e implementar 4 (drag de path relativo).
- Test que fije el comportamiento de Enter=Send / Shift+Enter segun la preferencia.
