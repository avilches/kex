---
id: TASK-545
title: >-
  Comandos Tauri sincronos con IO pesado bloquean el main thread (fs_grep,
  fs_glob, fs_copy, fs_read_file, history_*, wsl_home)
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 545000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 2, Bugs backend Rust, MEDIA. En Tauri 2 los #[tauri::command] sin async corren en el hilo principal: fs_grep/fs_grep_interactive (grep.rs:172,215), fs_glob (grep.rs:267), fs_copy (mutate.rs:115), fs_read_file hasta 10 MB (file.rs:53), history_* (primer ensure() escanea historiales y todo el PATH, history/mod.rs:118) y wsl_home (workspace.rs:642). Todos pueden congelar la UI. Contraste: fs_search, editor_scan y los comandos git si usan spawn_blocking. Fix: homogeneizar.
<!-- SECTION:DESCRIPTION:END -->
