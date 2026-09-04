---
id: TASK-676
title: >-
  operations.rs - parseo de git worktree list --porcelain implementado tres
  veces (list_branches, get_worktree_status, list_worktrees)
status: To Do
assignee: []
created_date: '2026-09-04 01:33'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: task
ordinal: 669000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 6, Codigo duplicado, MEDIA. src-tauri/src/modules/git/operations.rs - El parseo de worktree list --porcelain implementado tres veces (list_branches ~888, get_worktree_status ~1355, list_worktrees ~1414). Extraer parse_worktree_porcelain().
<!-- SECTION:DESCRIPTION:END -->
