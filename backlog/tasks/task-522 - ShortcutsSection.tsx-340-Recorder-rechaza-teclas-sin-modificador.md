---
id: TASK-522
title: 'ShortcutsSection.tsx:340 - Recorder rechaza teclas sin modificador'
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
ordinal: 522000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. El Recorder rechaza teclas sin modificador, impidiendo grabar F-keys sueltas (F2, F5, F12, Delete), que son justo los defaults de file.rename, view.zenMode, workspace.run, file.delete. Si el usuario limpia uno de esos atajos, no puede volver a asignarlo. Fix: permitir teclas no imprimibles sin modificadores.
<!-- SECTION:DESCRIPTION:END -->
