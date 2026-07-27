---
id: BUG-51
title: handlePathDeleted (fichero borrado externamente) no ofrece guardia a tabs markdown
area: markdown / editor / fs
severity: medium
status: sin confirmar
---

## Descripcion

`src/app/hooks/useTabCloseGuards.ts`, funcion `handlePathDeleted` (linea 155-163), maneja el caso en el
que un fichero abierto en un tab se borra externamente (fuera de la app):

```ts
const handlePathDeleted = useCallback(
  (path: string) => {
    const dirty: TabInfo[] = [];
    for (const ws of ...) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const tab of pane.tabs) {
          if (tab.kind !== "editor") continue;
          const p = (tab as { path?: string }).path ?? "";
          if (p !== path && !p.startsWith(`${path}/`)) continue;
          ...
```

El guard `if (tab.kind !== "editor") continue;` (linea 161) hace que solo los tabs `kind === "editor"`
sean considerados. Los tabs `kind === "markdown"` (el editor rich) cuyo fichero subyacente se borra
externamente quedan completamente fuera de este bucle: ni se les ofrece el dialogo de confirmacion "este
fichero fue borrado externamente, ¿cerrar el tab de todas formas?", ni se auto-cierran. Verificar
leyendo el resto de la funcion (que hace con `dirty` tras el bucle) para confirmar el efecto exacto sobre
esos tabs (probablemente simplemente no aparecen en ningun flujo de esta guardia, ni se cierran ni se
avisa).

## Distincion respecto a un fix relacionado ya aplicado

Este es un camino de codigo distinto de `src/app/hooks/closeQueue.ts`, que SI fue arreglado en un
follow-up del mismo dia del merge del plan para guardar el cierre normal (dirty-tab) de tabs markdown,
en paralelo a la guardia ya existente para tabs editor. `handlePathDeleted` cubre el flujo de
**borrado externo** (fs-changed / fichero desaparecido en disco), un flujo distinto del cierre manual de
un tab dirty, y quedo deliberadamente fuera del alcance de ese fix puntual.

## Impacto

Medio: si un fichero markdown abierto en el editor rich se borra desde fuera de la app (otro proceso,
terminal, git checkout, etc.), el tab puede quedar en un estado inconsistente sin que el usuario se
entere, o el autosave podria intentar recrear el fichero silenciosamente (relacionado con el patron ya
documentado en BUG-42 para tabs editor).

## Fix sugerido

Extender `handlePathDeleted` para tambien recolectar (dirty o todos, decidir cual segun el comportamiento
deseado - revisar que hace el resto de la funcion con `dirty` para los tabs `editor` y replicarlo)
tabs `kind === "markdown"` cuyo `path` coincida, con el mismo tratamiento que los tabs `editor`
reciben hoy. Anadir un test/verificacion manual: borrar externamente el fichero de un tab markdown
abierto en modo rich y confirmar que se ofrece el mismo dialogo (o el mismo comportamiento) que para un
tab editor equivalente.

## Relacionado

- BUG-42 (comportamiento de borrado externo sin verificar, alcance editor/diff).
- Fix ya aplicado en `closeQueue.ts` para el cierre normal (no borrado externo) de tabs markdown dirty.
