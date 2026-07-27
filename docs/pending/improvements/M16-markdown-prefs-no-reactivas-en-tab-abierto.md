# M16 - markdownEditor/markdownWikiLinks no son reactivas en un tab ya abierto (documentado, no bug)

**Prioridad:** Baja (nota informativa + mejora opcional)
**Esfuerzo:** Bajo-medio si se decide hacerlas reactivas

## Contexto

Las preferencias JSON-only `markdownEditor` (`"rich" | "legacy"`) y `markdownWikiLinks` (bool), ambas en
`settings-editor.json` y ya documentadas en `docs/ARCHITECTURE.md` (seccion `editor/`, listado de
preferencias JSON-only: `editorAutoSaveDelay`, `markdownEditor`, `markdownWikiLinks`), se leen una sola
vez al montar el tab markdown correspondiente. Cambiar cualquiera de las dos mientras un tab markdown ya
esta abierto no tiene efecto hasta que el tab se cierra y se vuelve a abrir.

**Esto no es un bug**: es el mismo patron que ya siguen otras preferencias JSON-only del proyecto (leidas
al montar, no reactivas a un cambio en caliente sobre una instancia de tab ya viva). Se documenta aqui
explicitamente para que nadie lo redescubra en el futuro y lo trate como una regresion.

## Mejora opcional (si se decide abordar)

Si en el futuro se quiere que el cambio de estas preferencias se refleje en un tab markdown ya abierto
sin cerrarlo:

1. `MarkdownTab.tsx` tendria que suscribirse al valor vivo de `markdownEditor`/`markdownWikiLinks` desde
   el store de preferencias en vez de leerlo solo en el montaje.
2. Decidir el comportamiento al cambiar `markdownEditor` en caliente: ¿reconstruir el editor
   (rich <-> legacy) preservando el contenido no guardado, o solo aplicar al proximo montaje como hoy?
   Esto tiene implicaciones de estado no trivial (buffer dirty, undo history) que conviene decidir con
   el usuario antes de implementar.
3. Si se aborda, replicar el mismo patron para el resto de preferencias JSON-only que compartan esta
   limitacion, no solo estas dos, para mantener coherencia.

## Relacionado

`docs/ARCHITECTURE.md`, seccion `editor/`, lista de preferencias JSON-only. Plan original:
`docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`.
