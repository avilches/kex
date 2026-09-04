---
id: TASK-538
title: 'D5: Nombre del fichero de persistencia incorrecto en AGENTS.md'
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels: []
dependencies: []
references:
  - docs/pending/DOCS.md
priority: medium
type: docs
ordinal: 538000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Documento: AGENTS.md linea 126.
Afirma: estado persistido en workspace-state.json via tauri-plugin-store, debounced 300 ms.
Realidad: el fichero es workspaces.json (src-tauri/src/lib.rs:292), persistido por ventana via el comando window_save_workspace_state. docs/WORKSPACES.md lo nombra bien. El debounce real en App.tsx es 800 ms, no 300.
Accion: corregir AGENTS.md a workspaces.json, persistencia por-ventana via window_save_workspace_state, y el debounce a 800 ms.
<!-- SECTION:DESCRIPTION:END -->
