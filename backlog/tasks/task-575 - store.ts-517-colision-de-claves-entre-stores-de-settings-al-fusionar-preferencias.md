---
id: TASK-575
title: >-
  store.ts:517 - colision de claves entre stores de settings al fusionar
  preferencias
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
ordinal: 502000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, ALTA. src/modules/settings/store.ts:517 - loadPreferences fusiona las entradas de los 5 stores en un unico Map, pero los stores comparten nombres de clave sin prefijo: theme (general vs editor) y fontFamily, fontSize, letterSpacing, lineHeight, cursorBlink, cursorStyle (terminal vs editor). Verificado: KEY_THEME = "theme" (linea 221) y KEY_EDITOR_THEME = "theme" (linea 260). Al construir el Map los valores del store de editor pisan a los demas: terminalFontSize puede leerse de settings-editor.json, y un editorTheme guardado (p. ej. "nord") acaba en result.theme sin validar, con ThemeProvider haciendo classList.add("nord"). El comentario de la linea 1128 reconoce la colision para los mapas de onChange, pero la carga inicial no la evita. Fix: un get por store (no fusionar) y validar theme con un parser como se hace con scmViewMode.
<!-- SECTION:DESCRIPTION:END -->
