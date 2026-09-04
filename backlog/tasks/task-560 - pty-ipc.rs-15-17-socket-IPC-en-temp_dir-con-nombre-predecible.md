---
id: TASK-560
title: 'pty/ipc.rs:15-17 - socket IPC en temp_dir() con nombre predecible'
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
ordinal: 560000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 3, Seguridad, MEDIA. Permisos por umask: en Linux otro usuario local puede inyectar eventos falsos de agente o pre-crear el path para DoS. Fix: XDG_RUNTIME_DIR o subdirectorio 0700 + chmod 0600.
<!-- SECTION:DESCRIPTION:END -->
