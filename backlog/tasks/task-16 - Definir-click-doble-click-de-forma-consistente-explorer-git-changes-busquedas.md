---
id: TASK-16
title: >-
  Definir click / doble-click de forma consistente (explorer, git changes,
  busquedas)
status: To Do
assignee: []
created_date: '2026-09-04 01:21'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: medium
type: idea
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: idea anotada (2026-06-24), por disenar.

El comportamiento de un click y un doble click sobre una fila de fichero es distinto y confuso segun donde estes. Solo el explorer tiene un modelo claro y configurable; los demas sitios reusan el mismo flag con otra semantica o lo ignoran.

Estado actual observado:
- Explorer (TreeRow.tsx): respeta la preferencia editorPreviewOnClick (configurable, default true). Single click abre en preview (tab efimero, se reemplaza al abrir otro); doble click abre permanente (pin). Modelo claro.
- Git changes / source control (SourceControlPanel.tsx): reusa el flag previewOnClick, pero la vista de diff no tiene concepto preview-vs-permanente. El flag solo decide si el diff se abre con single o con doble click. Misma preferencia, semantica distinta.
- Busquedas (ExplorerSearch.tsx): ignora el flag. Single click siempre abre (onOpenFile sin distincion de pin), no hay doble click ni modo preview. Tercera semantica.

Que decidir:
- Un modelo mental unico para toda la app: que significa single click y que significa doble click en cualquier lista de ficheros (explorer, git changes, busqueda de ficheros, busqueda de contenido, git-history).
- Si el concepto preview/permanente aplica al panel de diff y al de busqueda, o si esos abren siempre permanente.
- Reflejar la decision en la preferencia: hoy editorPreviewOnClick solo cubre bien el editor. Quiza renombrar/ampliar su alcance o documentar explicitamente que sitios afecta.

Objetivo: que el usuario pueda predecir, sin pensar, que pasa al hacer click o doble click en cualquier fila de fichero, y que la preferencia de preview tenga un efecto coherente en todos los sitios.
<!-- SECTION:DESCRIPTION:END -->
