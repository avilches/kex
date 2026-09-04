---
id: TASK-3
title: Popup de informacion para todos los tipos de tab
status: To Do
assignee: []
created_date: '2026-09-04 01:20'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: medium
type: idea
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: PENDIENTE (auditado 2026-06-30; la nota anterior era incorrecta). No existe ningun HoverCard ni popup rico en `PaneTabBar.tsx`: `hoverBody` y `GitFileHoverContent` no existen en el codigo. Solo hay un `title` nativo (tooltip del SO) con cwd y sessionId del agente. El popup rico de informacion por tipo de tab esta completamente sin implementar. Lo que hay que hacer:

- terminal: cwd actual, pty id (util para debug).
- editor: ruta completa del fichero, estado dirty, ultima modificacion.
- preview: URL, estado de conexion al servidor de desarrollo.
- git-history: rama activa, repo root.
- git-diff: fichero en diff, workspace.

Requiere crear un componente generico de HoverCard o especializarlo por `panel.kind`, y hacer el trigger condicional disponible para todos los tabs, no solo los de agente. Diseniar primero el componente base antes de implementar cada kind.
<!-- SECTION:DESCRIPTION:END -->
