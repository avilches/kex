---
id: TASK-558
title: >-
  git/operations.rs:1106-1152 - add_remote acepta cualquier URL (ext::sh ejecuta
  comandos)
status: To Do
assignee: []
created_date: '2026-09-04 01:24'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 558000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 3, Seguridad, MEDIA. add_remote acepta cualquier URL: una URL ext::sh -c <cmd> seguida de git_fetch_remote ejecuta comandos arbitrarios via el helper ext de git. Fix: allowlist de esquemas o -c protocol.ext.allow=never en run_git.
<!-- SECTION:DESCRIPTION:END -->
