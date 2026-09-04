---
id: TASK-18
title: Asignar hotkeys a tabs en workspaces
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: low
type: idea
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: idea anotada (2026-06-24); la navegacion por indice ya esta hecha, queda el binding por-tab.

Ya implementado (2026-06-24): workspace.selectByIndex (Cmd+1..9) salta al workspace N (Cmd+0 sigue siendo Reset Zoom). tab.selectByIndex (Ctrl+1..9, Ctrl+0 = ultimo) salta al tab N del pane activo (antes estaba roto, ahora usa matching comodin de digito en shortcuts.ts y handler real en App.tsx). Cmd+E rota el root del explorer, liberando Ctrl+1/Ctrl+2.

Que falta (lo que de verdad pedia la idea): hotkey pegado a un tab concreto, que el usuario asigne un atajo a un tab determinado y lo siga aunque cambie de posicion o de pane (binding por-tab persistido, no por-indice). Decidir donde se asigna (menu contextual del tab, o un modo asignar atajo) y como se persiste en el modelo Panel/Workspace. Debe vivir en el registry unico (shortcuts.ts) sin chocar con las familias de digito de tab.selectByIndex / workspace.selectByIndex.

Nota cross-platform: en Windows/Linux MOD_PROP es Ctrl, asi que Ctrl+0 (ultimo tab) se solapa con view.zoomReset; el tab gana por orden de registro y Reset Zoom queda reasignable. En macOS no hay conflicto.
<!-- SECTION:DESCRIPTION:END -->
