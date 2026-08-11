# IMP-MD-01: checklist de verificacion manual del editor markdown rich

Estado: en curso (iniciado por el usuario), pedido 2026-07-27.

## Objetivo

El editor markdown rich (TipTap 3), implementado en
`docs/superpowers/plans/2026-07-06-rich-markdown-editor.md` y
`docs/superpowers/specs/2026-07-06-rich-markdown-editor-design.md`, no pudo verificarse de forma
automatizada porque requiere conducir la ventana real de la app Tauri (no es posible sin cabeza/headless).
Se publico un checklist interactivo con 18 grupos de escenarios como Artifact para que el usuario lo
recorra manualmente:

https://claude.ai/code/artifact/f9e7ad80-0437-494c-9a5c-0c41792588d6

(el progreso persiste en el navegador via localStorage).

## Alcance del checklist

18 grupos de escenarios: controles de la toolbar, comandos slash, listas de tareas, tablas, callouts,
details (bloques colapsables), math/KaTeX, diagramas mermaid, buscar-en-nota, panel de outline, toggle
Rich/Source, comportamiento de guardado/autosave/recarga externa, wiki-links, fallback a la preferencia
legacy, y split-view con dos tabs markdown simultaneos.

## Estado a fecha de este registro (2026-07-27)

- El usuario ha empezado a probar el checklist y encontro un bug real: comportamiento de
  autosave-al-cerrar (cerrar un tab markdown sin que el autosave dispare, perdiendo cambios). Ya
  diagnosticado y arreglado en un follow-up del mismo dia, pendiente de revision final en la rama
  `worktree-fix-close-without-autosave` (no mergeada a `main` a fecha de este registro).
- Los ~17 grupos de escenarios restantes del checklist aun no han sido confirmados como funcionando por
  el usuario.

## Tarea

1. El usuario continua recorriendo el checklist del artifact enlazado arriba.
2. Cualquier bug nuevo que aparezca durante la verificacion manual se registra como su propio
   `BUG-NN` en `docs/pending/bugs/` (siguiendo el numero mas alto existente en ese momento), referenciando
   este item y el escenario concreto del checklist que lo disparo.
3. Cuando los 18 grupos queden confirmados sin hallazgos pendientes, marcar este item como completado y
   eliminarlo de `docs/PENDING.md` en el mismo commit que registre el ultimo hallazgo o confirmacion.

## Relacionado

Precedente de formato: [IMP-SP-02](IMP-SP-02-test-catalog-scratchpad.md) (catalogo de pruebas manuales
del scratchpad, mismo patron de checklist-como-item-de-pending para verificacion que no puede
automatizarse).
