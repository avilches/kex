---
id: TASK-509
title: 'useTerminalSession.ts:670-679 - onExit no comprueba ptyGen'
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 509000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. onExit no comprueba ptyGen (el guard existe solo en onData): un exit del PTY viejo tras un respawn brickea la sesion respawneada (shellExited = true, disableStdin). Hoy solo alcanzable via respawnSession (muerto), pero es una mina si se reactiva.
<!-- SECTION:DESCRIPTION:END -->
