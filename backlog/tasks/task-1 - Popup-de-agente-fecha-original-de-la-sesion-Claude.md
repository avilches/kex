---
id: TASK-1
title: 'Popup de agente: fecha original de la sesion Claude'
status: To Do
assignee: []
created_date: '2026-09-04 01:19'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: medium
type: idea
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: pendiente (anotado 2026-06-16).

El campo "Started" del HoverCard del tab de agente muestra el tiempo desde que el frontend detecto la senial `started`. En sesiones restauradas con --resume esto es el momento del restore, no el inicio original de la sesion.

La fecha real esta en el JSONL de la sesion (primera entrada con campo timestamp). Para recuperarla: leer ese timestamp en Rust al procesar SessionStart, incluirlo en el evento kex:agent-session-meta como campo sessionCreatedAt: u64, recibirlo en el bridge TS y guardarlo en AgentSessionMeta.sessionCreatedAt. El HoverCard mostraria la fecha original en lugar de startedAt del store cuando este campo este disponible.

Ficheros implicados: src-tauri/src/modules/agent/session_store.rs (lectura del JSONL), src-tauri/src/modules/pty/session.rs (incluir en el payload), src/modules/agents/lib/types.ts (extender AgentSessionMeta), src/modules/workspaces/PaneTabBar.tsx (mostrar en el popover).
<!-- SECTION:DESCRIPTION:END -->
