---
id: TASK-4
title: Notas Markdown + Marcadores (giro de producto)
status: To Do
assignee: []
created_date: '2026-09-04 01:20'
labels: []
dependencies: []
references:
  - docs/TODO.md
  - docs/NOTES_AND_BOOKMARKS_PLAN.md
priority: medium
type: idea
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Plan completo y fuente de verdad: NOTES_AND_BOOKMARKS_PLAN.md. Incluye especificacion, modelos de datos, 6 fases con rutas concretas, esqueletos de codigo (TS y Rust), criterios de aceptacion y comandos de verificacion por fase.

No es una mejora incremental del terminal: convierte Kex en un espacio de trabajo componible que ademas funciona como aplicacion de notas Markdown (edicion WYSIWYG) y un sistema de marcadores estilo Arc. Las notas son ficheros .md en disco, no una DB. Tres pilares pensados para anadirse poco a poco reusando primitivas existentes, sin crear modos exclusivos:

1. Notas Markdown con edicion WYSIWYG (estilo Notion/Bear).
2. Navegacion de notas: favoritos, recientes, busqueda por nombre y doble visor (carpetas + lista de notas) como segundo modo del explorer.
3. Marcadores estilo Arc: lista vertical de URLs a la izquierda, en carpetas, que abren en el panel preview existente.

NOTA DE LA MIGRACION (2026-09-04): el modulo notes/ y el kind de panel markdown YA EXISTEN en el codigo actual (ver AGENTS.md, seccion Module layout), asi que los pilares 1 y 2 de este plan pueden estar parcial o totalmente implementados. Revisar el estado real antes de retomar este item; el pilar 3 (marcadores estilo Arc) no parece tener modulo propio todavia.

Por donde empezar (segun el plan original): Fase 0 (refactor habilitador): columna derecha data-driven (registro de vistas en lugar de los 3 tabs hardcodeados) y extraer una capa compartida de persistencia de documento desde src/modules/editor/lib/useDocument.ts. Las fases 1, 3, 4 y 5 dependen de ella.

Decision tecnica abierta (segun el plan original): motor WYSIWYG. Recomendado entonces: Milkdown (preset Crepe), lazy. Alternativa ligera: extender CodeMirror con live preview estilo Obsidian. NOTA: el editor rich actualmente implementado usa TipTap 3 (ver RichMarkdownEditor en el glosario de CLAUDE.md), no Milkdown, asi que esta decision parece ya resuelta de otra forma; revisar contra el plan original.

Documentacion viva a actualizar al implementar lo que quede pendiente (mismo commit que el codigo): docs/ARCHITECTURE.md, docs/IPC.md, docs/FORK.md, AGENTS.md, docs/BUILD.md (solo si cambia el build).
<!-- SECTION:DESCRIPTION:END -->
