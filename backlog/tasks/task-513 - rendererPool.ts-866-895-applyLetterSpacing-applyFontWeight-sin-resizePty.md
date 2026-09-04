---
id: TASK-513
title: 'rendererPool.ts:866-895 - applyLetterSpacing/applyFontWeight sin resizePty'
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
ordinal: 513000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. applyLetterSpacing y applyFontWeight hacen fit() pero no resizePty cuando cambian cols/rows (a diferencia de applyFontSize/applyLineHeight/applyFontFamily): winsize del PTY desincronizado hasta el siguiente resize.
<!-- SECTION:DESCRIPTION:END -->
