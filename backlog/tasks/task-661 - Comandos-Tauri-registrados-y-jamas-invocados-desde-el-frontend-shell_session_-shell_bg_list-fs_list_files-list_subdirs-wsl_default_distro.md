---
id: TASK-661
title: >-
  Comandos Tauri registrados y jamas invocados desde el frontend
  (shell_session_*, shell_bg_list, fs_list_files, list_subdirs,
  wsl_default_distro)
status: To Do
assignee: []
created_date: '2026-09-04 01:32'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: task
ordinal: 654000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 5, Codigo muerto, Comandos Tauri sin caller en el frontend, MEDIA. Registrados en lib.rs y jamas invocados desde src/ (verificado con grep de invoke()): shell_session_open, shell_session_run, shell_session_close (arrastran todo shell/session.rs, ~200 lineas), shell_bg_list, fs_list_files, list_subdirs (el comentario "Kept for the CwdBreadcrumb" ya no es cierto) y wsl_default_distro. Eliminarlos o documentar por que se conservan.
<!-- SECTION:DESCRIPTION:END -->
