---
id: TASK-6
title: 'Explorer: arrastrar DESDE el explorer HACIA el SO (Finder/Explorer)'
status: To Do
assignee: []
created_date: '2026-09-04 01:20'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: low
type: idea
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: investigado 2026-06-17, viable en macOS, pendiente de implementar.

Hoy el drag de archivos solo funciona en dos direcciones: dentro del explorer (mover) y desde el SO hacia el explorer (copiar). Falta el sentido inverso: arrastrar un archivo/carpeta DESDE el explorer y soltarlo en Finder/Explorer del SO (u otra app) para copiarlo/exportarlo.

Hallazgos de la investigacion:
- HTML5 dragstart con DataTransfer de tipo Files esta bloqueado en webviews de Tauri: no funciona.
- El plugin oficial es crabnebula-dev/tauri-plugin-drag (Tauri 2 compatible). No esta en Cargo.toml ni en las capabilities.
- El plugin sortea el bloqueo iniciando el drag nativo desde Rust via IPC cuando el JS lo solicita.
- Compatibilidad: macOS funciona bien; Linux tiene reportes de problemas en algunos compositors (Mutter/KDE); Windows es experimental.

Costo estimado: Cargo.toml dep + lib.rs plugin + capability entry (trivial); comando Rust start_drag(paths: Vec<String>) (~40 lineas); hook onMouseDown largo en TreeRow.tsx -> IPC (~30 lineas); pruebas en macOS/Linux/Windows (1-2h). Total estimado ~2h. Riesgo principal: comportamiento en Linux.
<!-- SECTION:DESCRIPTION:END -->
