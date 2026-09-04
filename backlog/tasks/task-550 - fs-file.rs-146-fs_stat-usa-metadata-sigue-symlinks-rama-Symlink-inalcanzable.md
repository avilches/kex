---
id: TASK-550
title: >-
  fs/file.rs:146 - fs_stat usa metadata (sigue symlinks), rama Symlink
  inalcanzable
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: low
type: bug
ordinal: 550000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 2, Bugs backend Rust, BAJA. fs_stat usa std::fs::metadata (sigue symlinks): la rama StatKind::Symlink es inalcanzable; en fs_read_dir los symlinks validos se reportan como File/Dir. Fix: symlink_metadata para el kind.
<!-- SECTION:DESCRIPTION:END -->
