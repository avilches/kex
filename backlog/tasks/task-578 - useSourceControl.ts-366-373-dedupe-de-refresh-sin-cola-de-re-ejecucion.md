---
id: TASK-578
title: 'useSourceControl.ts:366-373 - dedupe de refresh() sin cola de re-ejecucion'
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: high
type: bug
ordinal: 505000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, ALTA. El dedupe de refresh() devuelve la promesa in-flight sin encolar re-ejecucion. Dos escenarios rotos: (1) al cambiar contextPath con un refresh del contexto anterior en vuelo, el contexto nuevo nunca se resuelve y el panel queda bloqueado en isSwitchingContext hasta el siguiente evento; (2) el reconcile post stage/unstage (scheduleReconcile, 180ms) se descarta si hay un refresh en vuelo cuyo git status se leyo antes de la mutacion, y el snapshot pre-mutacion pisa el estado optimista sin correccion posterior (.git/index no esta en el watcher). Fix: encolar un trailing re-run cuando llega una peticion con otra en vuelo.
<!-- SECTION:DESCRIPTION:END -->
