---
id: TASK-542
title: 'D9: AGENTS.md omite el modulo fs::watch y el script init.fish'
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels: []
dependencies: []
references:
  - docs/pending/DOCS.md
priority: low
type: docs
ordinal: 542000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Realidad: fs_watch_add y fs_watch_remove existen y se registran pero AGENTS.md no los menciona en la descripcion de fs::* (si estan en IPC.md). El script src-tauri/src/modules/pty/scripts/init.fish existe y ARCHITECTURE.md/README listan fish como shell soportado, pero la seccion PTY shell integration de AGENTS.md solo enumera zsh/bash/Windows.
Accion: anadir fs::watch::* a la descripcion de fs::* y init.fish a la lista de scripts de shell en AGENTS.md.

Contexto adicional (resumen IPC del mismo informe): 44 comandos registrados en lib.rs. Todos los 153 entries de docs/IPC.md existen en el codigo (ningun comando documentado fantasma). Faltante en IPC.md: solo restore_window_geometry (D8). AGENTS.md es overview, no superficie exhaustiva, y omite varios comandos (fs_grep_interactive, history_*, window_*, pty_has_foreground_process, pty_shell_name, etc.); severidad baja porque remite a IPC.md.
<!-- SECTION:DESCRIPTION:END -->
