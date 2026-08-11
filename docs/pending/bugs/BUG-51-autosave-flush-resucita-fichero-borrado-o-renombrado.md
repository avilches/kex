---
id: BUG-51
title: El flush de autosave al desmontar o cambiar de path resucita un fichero borrado o renombrado
area: markdown / editor / document-buffer
severity: medium-high
status: sin confirmar
---

## Descripcion

`src/modules/markdown/lib/useMarkdownDocument.ts`, el `useEffect` de flush (alrededor de la linea
200-210), y su equivalente en `src/modules/editor/lib/useDocument.ts` (alrededor de la linea 168-177),
guardan el buffer si esta dirty al desmontar el tab o al cambiar `path`:

```ts
useEffect(() => {
  return () => {
    clearAutoSaveTimer();
    const buf = bufferRef.current;
    if (buf?.isDirty()) {
      saveNow().catch((e) => {
        console.error("[autosave flush]", e);
      });
    }
  };
}, [path, clearAutoSaveTimer, saveNow]);
```

`saveNow` cierra sobre `path` (`useCallback(..., [path])` en la linea ~53-69 de
`useMarkdownDocument.ts`). El cleanup de un efecto siempre corre con los closures de la renderizacion que
lo creo, asi que cuando `path` cambia, este cleanup ejecuta el `saveNow` construido para el `path`
ANTERIOR, no el nuevo. Dos consecuencias, ambas ahora alcanzables desde acciones de primera clase de la
vista de notas porque `handlePathDeleted` (`src/app/hooks/useTabCloseGuards.ts`, linea 161) y
`handlePathRenamed` (`src/app/App.tsx`, linea 1605) se ampliaron para incluir tabs `kind === "markdown"`
ademas de `kind === "editor"`:

- **Borrar una nota con el tab markdown con cambios sin guardar**: `handlePathDeleted` detecta el tab
  dirty y lo enruta al dialogo "Unsaved Changes / Close Anyway". Al confirmar, `disposeTab` desmonta el
  tab; el cleanup de este efecto llama a `saveNow()`, cuya escritura atomica recrea el fichero que el
  usuario acaba de borrar. El indice de notas se refresca en esa escritura y la nota reaparece.
- **Renombrar una nota con el tab markdown con cambios sin guardar**: `handlePathRenamed` actualiza
  `tab.path` de `from` a `to` via `updateTabData`. El cleanup de este efecto (deps `[path, ...]`) se
  dispara con los closures de la renderizacion anterior, asi que el flush apunta al path VIEJO y recrea el
  fichero pre-rename con el contenido editado, mientras el fichero renombrado se queda con el contenido
  previo a la edicion.

`editorAutoSave` es `false` por defecto (`src/modules/settings/store.ts`), asi que un tab dirty es el
caso normal, no un edge case: cualquier nota o fichero con ediciones pendientes dispara uno de estos dos
caminos en cuanto se borra o renombra desde la vista de notas.

## Impacto

Medio-alto: perdida silenciosa de la intencion del usuario. En el caso de borrado, el fichero que el
usuario quiso eliminar vuelve a aparecer sin aviso. En el caso de renombrado, el resultado es peor: quedan
DOS ficheros, el viejo con el contenido nuevo (resucitado) y el nuevo con el contenido viejo (sin la
edicion), una divergencia silenciosa dificil de detectar despues del hecho.

## Origen

Bug preexistente en `main`, no introducido por la feature de notas: la clase de bug (cleanup de efecto
con closure de `path` obsoleto) ya afectaba a los tabs `editor` a traves de `useDocument.ts` antes de esta
rama. Relacionado con el patron ya documentado en BUG-42 (borrar un fichero con el editor abierto), si
sigue abierto. Lo que la feature de notas anade es que Delete y Rename desde `NotesView` son ahora el
camino MAS COMUN para disparar este bug, porque `handlePathDeleted`/`handlePathRenamed` se ampliaron para
cubrir tabs markdown y porque el flujo de notas anima a tener varios tabs markdown abiertos con cambios
sin guardar (autosave desactivado por defecto).

## Fix sugerido

El fix no pertenece al modulo de notas: pertenece a la capa de document-buffer/hooks compartidos
(`useMarkdownDocument.ts`, `useDocument.ts`). Opciones a evaluar:

1. Capturar `path` en un ref actualizado sincronicamente en cada render (no solo en el closure de
   `useCallback`), y que el cleanup lo lea del ref en vez de depender del closure de la renderizacion que
   creo el efecto.
2. Separar el efecto de "flush on unmount" (path fijo, siempre el ultimo path conocido antes de desmontar)
   del de "flush on path change", y en el segundo caso decidir explicitamente si tiene sentido seguir
   guardando en el path viejo o si hay que abortar el guardado y avisar al usuario de que perdera cambios
   si no los aplica a mano al nuevo path.
3. Para el caso de borrado, considerar si un fichero que se acaba de borrar deberia poder "recrearse" via
   autosave sin confirmacion explicita del usuario, independientemente del fix del closure.

Anadir un test que cubra ambos escenarios (delete con tab dirty, rename con tab dirty) una vez decidido el
comportamiento correcto.

## Relacionado

- BUG-42 (borrar un fichero con el editor abierto, sin verificar; mismo subsistema).
- `src/app/hooks/useTabCloseGuards.ts` (`handlePathDeleted`) y `src/app/App.tsx` (`handlePathRenamed`),
  ambos ampliados a tabs markdown en esta rama, lo que hace que ambos caminos sean alcanzables desde
  `NotesView`.
