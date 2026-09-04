---
id: TASK-559
title: >-
  git/operations.rs:1022-1067 - checkout_branch/create_branch no rechazan
  nombres que empiezan por -
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
ordinal: 559000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 3, Seguridad, MEDIA. --detach u --orphan=x se interpretan como opciones. Fix: rechazar prefijo - o validar con git check-ref-format.
<!-- SECTION:DESCRIPTION:END -->
