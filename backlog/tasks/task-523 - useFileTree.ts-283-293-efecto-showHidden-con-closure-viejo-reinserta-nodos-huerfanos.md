---
id: TASK-523
title: >-
  useFileTree.ts:283-293 - efecto showHidden con closure viejo reinserta nodos
  huerfanos
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 523000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. El efecto de showHidden (con rootPath en deps) corre en el mismo commit en que el cambio de root resetea nodes y, con el closure viejo, relanza fs_read_dir para todos los directorios del root anterior; los resultados reinsertan nodos huerfanos en el estado del root nuevo para siempre. Fix: snapshot del root en ref y abortar si no coincide.
<!-- SECTION:DESCRIPTION:END -->
