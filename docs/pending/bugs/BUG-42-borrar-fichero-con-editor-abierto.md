---
id: BUG-42
title: Borrar un fichero con el editor abierto - comportamiento sin verificar
area: editor / fs / explorer
severity: low
status: sin confirmar
---

## Descripcion

No esta verificado que pasa cuando se borra un fichero (desde el explorer, desde fuera de la app, o por una herramienta externa) mientras ese fichero esta abierto en un editor.

## Que probar

- Borrar el fichero desde el explorer teniendo el tab del editor abierto: el tab deberia avisar o cerrarse de forma controlada, no quedar en un estado inconsistente.
- Borrar el fichero desde fuera de la app (terminal, otro proceso) y volver al editor: que ocurre al intentar guardar (autosave incluido).
- Comprobar que no se recrea el fichero silenciosamente por un autosave posterior, ni se pierde el aviso de error (relacionado con BUG-30: fs mutations + autosave silencian errores).

## Comportamiento actual observado (2026-06-24)

- **Editor: mensaje en rojo muy generico.** Al borrarse el fichero, tanto la carga inicial como `reload()` caen en `setDoc({ status: "error", message: String(e) })` (`useDocument.ts:104` y `:133`). El estado `error` se pinta en rojo con el string crudo del error de IPC, sin distinguir ENOENT (fichero borrado) de un fallo real de lectura, y sin ofrecer ninguna accion al usuario.
- **Vista de diff: no hace nada.** `GitDiffPane.tsx` no escucha `fs-changed` ni revalida el path: si el fichero del diff se borra, el panel se queda mostrando el contenido obsoleto, sin avisar ni cerrarse.

## Impacto

Posible perdida de datos, recreacion accidental del fichero borrado, o estado de tab huerfano. UX pobre: mensaje rojo sin contexto en el editor y diff que muestra contenido fantasma.

## Pendiente (mejora de experiencia, no solo verificacion)

- **Editor**: distinguir ENOENT del resto de errores en `reload()`/carga inicial. Para el caso "borrado en disco", reemplazar el rojo generico por un estado dedicado con copy claro y acciones: cerrar el tab, o conservar el buffer en memoria y ofrecer "Guardar para recrear el fichero" (decidir si recrear es opt-in explicito). Frenar el autosave mientras el fichero no exista para no recrearlo de forma silenciosa.
- **Vista de diff**: definir el comportamiento cuando el fichero subyacente desaparece (cerrar el panel, marcarlo como obsoleto con aviso, o revalidar). Hoy no reacciona; al menos debe avisar de que el contenido ya no refleja el disco.
- Verificacion manual de todos los casos anteriores (explorer, externo, autosave).
- Alinear el copy con la nota de [MODAL_MESSAGES.md](../MODAL_MESSAGES.md) (mensajes destructivos y de resultado coherentes en toda la app).
