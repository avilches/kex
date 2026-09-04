---
id: TASK-577
title: >-
  useTerminalSession.ts:697 + rendererPool.ts:384-409 - slot reciclado de blocks
  con teclado deshabilitado
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: high
type: bug
ordinal: 504000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, ALTA. Un slot reciclado desde un tab de blocks queda con la textarea de xterm deshabilitada. applyBlockMode pone slot.term.textarea.disabled = true en modo prompt y ni detachSlotFromLeaf ni bindSlot lo restablecen. Al cerrar un tab de blocks, el cleanup de unmount devuelve el slot al pool antes de que disposeSession corra, asi que el slot sobrevive contaminado y el siguiente terminal que lo adquiera no puede recibir teclado. Fix: bindSlot debe restaurar el set completo de opciones per-leaf (textarea.disabled = false, y ver cursorInactiveStyle en Incoherencias).
<!-- SECTION:DESCRIPTION:END -->
