---
id: TASK-12
title: 'Explorer: View File History (historial git de un fichero)'
status: To Do
assignee: []
created_date: '2026-09-04 01:21'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: medium
type: idea
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: idea anotada (2026-06-21).

Accion de menu contextual en el explorer para abrir el historial git de un fichero concreto, esten o no sus cambios sin commitear. Complementa al panel de Source Control, que solo lista ficheros modificados: el explorer muestra todos los ficheros del repo, asi que es el sitio natural para ver el historial de este fichero aunque no este tocado.

No es un quick win: hoy no existe filtro por path en ninguna capa.

Lo que falta:
1. Rust: git_log (src-tauri/src/modules/git/commands.rs:101) y operations::log() (operations.rs:474) no aceptan path. Anadir un parametro path: Option<String> y, cuando venga, pasar -- <path> al git log.
2. Tipo de panel: el panel git-history (src/modules/workspaces/lib/types.ts:10) es repo-wide ({ kind, repoRoot }). Anadir filePath?: string y propagarlo.
3. UI: el componente de git-history debe filtrar por ese path y mostrar un titulo tipo History: foo.ts. openGitHistoryInPanel() (en App.tsx) debe aceptar el path opcional.
4. Gating: mostrar la accion solo si el fichero esta dentro de un repo (git_resolve_repo, cacheado por root del explorer).

Beneficio extra: el filtro por path en git_log habilita despues ver un commit concreto de un fichero y otros flujos de historial por fichero.
<!-- SECTION:DESCRIPTION:END -->
