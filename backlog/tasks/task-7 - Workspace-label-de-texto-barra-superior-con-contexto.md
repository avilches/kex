---
id: TASK-7
title: 'Workspace: label de texto + barra superior con contexto'
status: To Do
assignee: []
created_date: '2026-09-04 01:20'
updated_date: '2026-09-04 01:20'
labels: []
dependencies: []
references:
  - docs/TODO.md
  - docs/pending/features/F14-pr-de-la-rama-actual.md
priority: low
type: idea
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: PARCIAL (actualizado 2026-06-30). La pieza 1 (nombre del workspace en la barra superior) esta IMPLEMENTADA: Header.tsx recibe activeWorkspace y activePanel y renderiza WorkspaceTitle.tsx (modulo header/), que muestra el icono del workspace, su title, el badge de status y el titulo de la tab activa. Quedan pendientes las piezas 2 y 3.

Motivacion: la barra de titulo superior estaba practicamente vacia. Se podria aprovechar para mostrar:

1. Nombre/label del workspace: HECHO (2026-06-30).
2. Ultima notificacion del tab activo: PENDIENTE. Hoy la segunda linea muestra el titulo/descripcion de la tab, no el ultimo mensaje de notificacion del agente. Mostrar el ultimo mensaje literal (Claude Code, Codex) sin ir al panel de notificaciones sigue sin hacerse.
3. PR de la rama actual: PENDIENTE. Rama git del panel activo y, si hay remote configurado, el PR asociado (via gh pr view --json number,title,url o la API de GitHub). Base tecnica de F13/F14 (IPC git_current_pr).

Dependencias: la notificacion del tab necesita leer la ultima notif del agentStore para el panel activo (WorkspaceTitle.tsx ya esta suscrito). El PR de rama requiere una nueva IPC (git_current_pr) o llamar a la GitHub API desde el frontend.

Prioridad: baja. El nombre del workspace ya esta. La notificacion del tab es el siguiente paso mas barato; el PR de rama es el mas costoso.
<!-- SECTION:DESCRIPTION:END -->
