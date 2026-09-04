---
id: TASK-701
title: >-
  package.json - zod y use-stick-to-bottom como dependencias de runtime sin un
  solo import en src/
status: To Do
assignee: []
created_date: '2026-09-04 01:33'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: high
type: task
ordinal: 694000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 8, Dependencias, ALTA. package.json - zod y use-stick-to-bottom como dependencias de runtime sin un solo import en src/ (verificado; use-stick-to-bottom es resto de los componentes ai-elements, cuyo directorio ya no existe pero knip.json aun lo ignora). Quitar ambas y limpiar la entrada de knip.json.
<!-- SECTION:DESCRIPTION:END -->
