---
id: TASK-705
title: >-
  TerminalPane.tsx:98-102 - el efecto de tema depende de session, cuyo memo
  cambia con cada focus/blur del scratchpad, repintando todos los slots
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
ordinal: 698000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 9, Optimizaciones, MEDIA. src/modules/terminal/TerminalPane.tsx:98-102 - El efecto de tema depende de session, cuyo memo cambia con cada scratchpadFocused/blockMode: cada focus/blur del scratchpad re-aplica el theme a TODOS los slots del pool (repaint completo de todos los terminales). Depender solo de [resolvedMode, themeId, customThemes].
<!-- SECTION:DESCRIPTION:END -->
