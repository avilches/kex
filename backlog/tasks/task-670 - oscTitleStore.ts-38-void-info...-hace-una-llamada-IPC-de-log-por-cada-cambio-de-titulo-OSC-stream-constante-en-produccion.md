---
id: TASK-670
title: >-
  oscTitleStore.ts:38 - void info(...) hace una llamada IPC de log por cada
  cambio de titulo OSC, stream constante en produccion
status: To Do
assignee: []
created_date: '2026-09-04 01:33'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: task
ordinal: 663000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 5, Codigo muerto, Instrumentacion DEBUG pendiente de retirar. src/modules/terminal/lib/oscTitleStore.ts:38 - void info(...): una llamada IPC de log por CADA cambio de titulo OSC. Claude Code actualiza el titulo continuamente mientras trabaja: es un stream constante de IPC en produccion. (Los demas items de este bloque en el informe original -Header.tsx, PaneTabBar.tsx, useTerminalSession.ts leafFocusDebugLabel/Target, TerminalPathBarMenu.tsx "Tab id"- ya estan resueltos: los tres primeros se descartaron con un revert y el ultimo se conservo deliberadamente como feature.)
<!-- SECTION:DESCRIPTION:END -->
