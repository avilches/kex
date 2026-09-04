---
id: TASK-13
title: >-
  Terminal: opciones de configuracion adicionales (bell, paste protection, copy
  on select)
status: To Do
assignee: []
created_date: '2026-09-04 01:21'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: medium
type: idea
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: pendiente (anotado 2026-06-22).

Continuacion de la tanda de ajustes de terminal (cursor style, inactive style, cursor width, scroll sensitivity) ya implementados. Tres opciones mas que comparten el mismo patron de plumbing: campo en Preferences + default + parse/clamp + setter + entrada en PREF_KEY_MAP (src/modules/settings/store.ts), funcion apply* en src/modules/terminal/lib/rendererPool.ts, effect en useTerminalSession.ts, y control en GeneralSection.tsx.

1. Campana (bell): hoy no se hace nada con la senial de campana. xterm expone el evento term.onBell. Opciones: silenciosa (por defecto), visual (flash breve del terminal) y/o sonido. Requiere implementar el efecto: suscribirse a onBell en createSlot y disparar el modo elegido.

2. Confirmar pegado multilinea (paste protection): avisar antes de pegar texto que contiene saltos de linea, para evitar ejecutar comandos sin querer. Interceptar el paste (handler de xterm / clipboard) y mostrar confirmacion cuando el texto pegado tenga salto de linea.

3. Copy on select / paste con boton derecho: comportamiento estilo terminal clasico (copiar automaticamente al seleccionar, pegar con click derecho). Dos toggles independientes. xterm da onSelectionChange para copy-on-select; el paste con boton derecho se cablea en el handler de contextmenu del host del slot.
<!-- SECTION:DESCRIPTION:END -->
