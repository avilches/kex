# Explorer root recordado por fichero - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada panel de fichero (editor/markdown) recuerde el `explorerRoot` del momento en que se abrio y que el explorer mas git salten a ese root al activar el tab, persistiendo entre reinicios.

**Architecture:** Logica de decision en funciones puras testeables (`resolveOpenRoot`, `resolveActiveExplorerRoot`). El `explorerRoot` que consume todo (arbol, decoraciones git, panel SC) se calcula a partir del panel activo con fallback al root ambiental derivado del terminal. La captura ocurre en los puntos de apertura de fichero; la persistencia es automatica (Rust guarda los workspaces como JSON sin tipar).

**Tech Stack:** React 19 + TypeScript, vitest (node env, tests de funciones puras), biome (lint).

## Global Constraints

- Imports siempre `@/...`, nunca relativos entre modulos. (excepcion: ficheros dentro del mismo directorio usan `./`)
- Sin em-dash en codigo, comentarios, commits ni docs.
- Sin emojis.
- Comentarios: por defecto ninguno; si hace falta, 1-2 lineas sobre el porque, nunca el que.
- Forma canonica de paths en el frontend: forward-slash. Normalizar separadores con `.split(/[\\/]/)` o `.replace(/\\/g, "/")` donde un path pueda venir de OSC 7, el explorer o el SO.
- pnpm only, nunca npm/npx/yarn.
- Checks: `pnpm lint`, `pnpm check-types`, `pnpm test`.

## Setup

Estamos en `main`. Crear una rama de feature antes de empezar a commitear:

```bash
git checkout -b feat/explorer-root-por-fichero
```

## File Structure

- `src/modules/workspaces/lib/explorerRoot.ts` (nuevo) - funciones puras `resolveOpenRoot`, `resolveActiveExplorerRoot`.
- `src/modules/workspaces/lib/explorerRoot.test.ts` (nuevo) - tests unitarios.
- `src/modules/workspaces/lib/types.ts` (modificar) - campo `explorerRoot?` en `editor` y `markdown`.
- `src/app/App.tsx` (modificar) - root ambiental vs expuesto, ref, captura al abrir, wrapper de DnD.
- `src/modules/workspaces/lib/useWorkspaces.ts` (modificar) - `splitPaneAndOpenFile` acepta y fija `explorerRoot`; `setPanelView` arrastra el campo.
- `src/modules/workspaces/WorkspaceDndProvider.tsx` (modificar) - tipo de la prop `onSplitPaneAndOpenFile` a 4 argumentos.
- `src/modules/source-control/useSourceControlContext.ts` (modificar) - rama editor usa `explorerRoot`.

---

### Task 1: Funciones puras de resolucion de root

**Files:**
- Create: `src/modules/workspaces/lib/explorerRoot.ts`
- Test: `src/modules/workspaces/lib/explorerRoot.test.ts`

**Interfaces:**
- Consumes: `pathDirname` de `@/lib/pathUtils`.
- Produces:
  - `resolveOpenRoot(explorerRoot: string | null, path: string): string`
  - `resolveActiveExplorerRoot(activePanel: { kind: string; explorerRoot?: string } | null, ambient: string | null): string | null`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/modules/workspaces/lib/explorerRoot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveActiveExplorerRoot, resolveOpenRoot } from "./explorerRoot";

describe("resolveOpenRoot", () => {
  it("devuelve explorerRoot cuando el fichero esta dentro", () => {
    expect(resolveOpenRoot("/proj", "/proj/src/a.ts")).toBe("/proj");
  });
  it("devuelve la carpeta padre cuando el fichero esta fuera del root", () => {
    expect(
      resolveOpenRoot("/proj", "/home/u/.config/kex/themes/x.json"),
    ).toBe("/home/u/.config/kex/themes");
  });
  it("devuelve la carpeta padre cuando no hay root ambiental", () => {
    expect(resolveOpenRoot(null, "/proj/src/a.ts")).toBe("/proj/src");
  });
  it("trata el propio root como dentro", () => {
    expect(resolveOpenRoot("/proj", "/proj")).toBe("/proj");
  });
  it("no trata un prefijo hermano como dentro", () => {
    expect(resolveOpenRoot("/proj", "/projOther/a.ts")).toBe("/projOther");
  });
  it("normaliza backslashes antes de comparar", () => {
    expect(resolveOpenRoot("C:/proj", "C:\\proj\\src\\a.ts")).toBe("C:/proj");
  });
});

describe("resolveActiveExplorerRoot", () => {
  it("usa el explorerRoot del panel para un editor activo", () => {
    expect(
      resolveActiveExplorerRoot({ kind: "editor", explorerRoot: "/a" }, "/b"),
    ).toBe("/a");
  });
  it("usa el explorerRoot del panel para un markdown activo", () => {
    expect(
      resolveActiveExplorerRoot({ kind: "markdown", explorerRoot: "/a" }, "/b"),
    ).toBe("/a");
  });
  it("cae al ambiental cuando el panel no tiene explorerRoot", () => {
    expect(resolveActiveExplorerRoot({ kind: "editor" }, "/b")).toBe("/b");
  });
  it("cae al ambiental para un panel de terminal", () => {
    expect(resolveActiveExplorerRoot({ kind: "terminal" }, "/b")).toBe("/b");
  });
  it("cae al ambiental cuando no hay panel activo", () => {
    expect(resolveActiveExplorerRoot(null, "/b")).toBe("/b");
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `pnpm exec vitest run src/modules/workspaces/lib/explorerRoot.test.ts`
Expected: FAIL ("Failed to resolve import './explorerRoot'" o "is not a function").

- [ ] **Step 3: Implementar las funciones**

Crear `src/modules/workspaces/lib/explorerRoot.ts`:

```ts
import { pathDirname } from "@/lib/pathUtils";

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

function isUnder(path: string, root: string): boolean {
  const p = normalize(path);
  const r = normalize(root);
  if (p === r) return true;
  return p.startsWith(r.endsWith("/") ? r : `${r}/`);
}

// Root a recordar para un fichero abierto mientras se mostraba `explorerRoot`:
// el propio explorerRoot si el fichero cuelga de el, o la carpeta del fichero.
export function resolveOpenRoot(
  explorerRoot: string | null,
  path: string,
): string {
  if (explorerRoot && isUnder(path, explorerRoot)) return explorerRoot;
  return pathDirname(path);
}

// Root expuesto: el del panel de fichero activo si lo recuerda, si no el ambiental.
export function resolveActiveExplorerRoot(
  activePanel: { kind: string; explorerRoot?: string } | null,
  ambient: string | null,
): string | null {
  if (
    activePanel &&
    (activePanel.kind === "editor" || activePanel.kind === "markdown") &&
    activePanel.explorerRoot
  ) {
    return activePanel.explorerRoot;
  }
  return ambient;
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `pnpm exec vitest run src/modules/workspaces/lib/explorerRoot.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Lint y types**

Run: `pnpm check-types && pnpm lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/modules/workspaces/lib/explorerRoot.ts src/modules/workspaces/lib/explorerRoot.test.ts
git commit -m "feat(workspaces): helpers puros para el explorer root por fichero"
```

---

### Task 2: Modelo de datos y cableado de captura/resolucion

**Files:**
- Modify: `src/modules/workspaces/lib/types.ts:3,5`
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts:224-245`
- Modify: `src/modules/workspaces/WorkspaceDndProvider.tsx:50`
- Modify: `src/app/App.tsx:337-348,396-425,1235`

**Interfaces:**
- Consumes: `resolveOpenRoot`, `resolveActiveExplorerRoot` de `@/modules/workspaces/lib/explorerRoot` (Task 1).
- Produces: paneles `editor`/`markdown` con `explorerRoot?: string`; `splitPaneAndOpenFile(workspaceId, targetPaneId, direction, path, explorerRoot)`.

- [ ] **Step 1: Anadir el campo al modelo**

En `src/modules/workspaces/lib/types.ts`, sustituir las lineas de `editor` y `markdown`:

```ts
  | { id: string; kind: "editor";          path: string;  title?: string; dirty: boolean; preview: boolean; explorerRoot?: string }
  | { id: string; kind: "preview";         url: string;   title?: string }
  | { id: string; kind: "markdown";        path: string;  title?: string; explorerRoot?: string }
```

- [ ] **Step 2: `splitPaneAndOpenFile` acepta y fija explorerRoot**

En `src/modules/workspaces/lib/useWorkspaces.ts`, cambiar la firma (linea 224-229) anadiendo el parametro:

```ts
  const splitPaneAndOpenFile = useCallback((
    workspaceId: string,
    targetPaneId: string,
    direction: "left" | "right" | "top" | "bottom",
    path: string,
    explorerRoot: string,
  ) => {
```

Y en la creacion del panel (linea 239):

```ts
        const panel: Panel = { id: newPanelId(), kind: "editor", path, preview: false, dirty: false, explorerRoot };
```

- [ ] **Step 3: Tipo de la prop DnD a 4 argumentos**

En `src/modules/workspaces/WorkspaceDndProvider.tsx`, sustituir la linea 50:

```ts
  onSplitPaneAndOpenFile: (
    workspaceId: string,
    targetPaneId: string,
    direction: "left" | "right" | "top" | "bottom",
    path: string,
  ) => void;
```

(La llamada en linea 236 ya pasa esos 4 argumentos; no se toca.)

- [ ] **Step 4: Root ambiental vs expuesto y ref en App.tsx**

En `src/app/App.tsx`, anadir el import (junto a los de `@/modules/workspaces`):

```ts
import { resolveActiveExplorerRoot, resolveOpenRoot } from "@/modules/workspaces/lib/explorerRoot";
```

Sustituir el memo actual (lineas 337-348) por:

```ts
  const ambientExplorerRoot = useMemo<string | null>(() => {
    if (activeCwd) return activeCwd;
    if (lastTerminalCwdRef.current) return lastTerminalCwdRef.current;
    for (const ws of workspaces) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const panel of pane.panels) {
          if (panel.kind === "terminal" && panel.cwd) return panel.cwd;
        }
      }
    }
    return home;
  }, [activeCwd, workspaces, home]);

  const explorerRoot = useMemo<string | null>(
    () => resolveActiveExplorerRoot(activePanel, ambientExplorerRoot),
    [activePanel, ambientExplorerRoot],
  );

  const explorerRootRef = useRef<string | null>(null);
  explorerRootRef.current = explorerRoot;
```

- [ ] **Step 5: Capturar el root al abrir un fichero**

En `src/app/App.tsx`, dentro de `openFileInPanel`, sustituir el bloque de creacion (lineas 414-421) por:

```ts
      const panelId = newPanelId();
      const panelExplorerRoot = resolveOpenRoot(explorerRootRef.current, path);
      openPanel(
        activeWorkspace.id,
        activeWorkspace.activePaneId,
        markdown
          ? { id: panelId, kind: "markdown", path, explorerRoot: panelExplorerRoot }
          : { id: panelId, kind: "editor", path, dirty: false, preview: !(pin ?? false), explorerRoot: panelExplorerRoot },
      );
      return panelId;
```

- [ ] **Step 6: Inyectar el root en la apertura por DnD**

En `src/app/App.tsx`, sustituir la prop (linea 1235):

```tsx
              onSplitPaneAndOpenFile={(workspaceId, targetPaneId, direction, path) =>
                splitPaneAndOpenFile(
                  workspaceId,
                  targetPaneId,
                  direction,
                  path,
                  resolveOpenRoot(explorerRootRef.current, path),
                )
              }
```

- [ ] **Step 7: Types y lint**

Run: `pnpm check-types && pnpm lint`
Expected: sin errores. (Si `check-types` se queja de que `resolveActiveExplorerRoot` recibe `activePanel` con tipo `Panel | null`, es compatible: `Panel` tiene `kind` y los de fichero tienen `explorerRoot?`.)

- [ ] **Step 8: Test suite completa**

Run: `pnpm test`
Expected: todo verde (incluye los 11 de Task 1).

- [ ] **Step 9: Commit**

```bash
git add src/modules/workspaces/lib/types.ts src/modules/workspaces/lib/useWorkspaces.ts src/modules/workspaces/WorkspaceDndProvider.tsx src/app/App.tsx
git commit -m "feat(workspaces): recordar el explorer root al abrir cada fichero"
```

---

### Task 3: Consistencia de git y toggle markdown/editor

**Files:**
- Modify: `src/modules/source-control/useSourceControlContext.ts:60`
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts:369-380`

**Interfaces:**
- Consumes: el `explorerRoot` expuesto (Task 2) que ya llega como parametro a `useSourceControlContext`; el campo `explorerRoot?` del panel (Task 2).
- Produces: nada nuevo; ajusta consumidores existentes.

- [ ] **Step 1: La rama de editor usa explorerRoot**

En `src/modules/source-control/useSourceControlContext.ts`, dentro de `sourceControlContextPath`, sustituir la linea del editor (linea 60):

```ts
    if (activeTab?.kind === "editor") return explorerRoot;
```

Razon: el `explorerRoot` recibido ya es el root recordado del fichero activo (Task 2), asi que git resuelve el mismo repo que muestra el arbol. Evita resolver un repo anidado distinto en monorepos.

`dirname` (lineas 6-12) queda sin uso tras este cambio (era su unico consumidor). Eliminar la funcion entera para que biome no la marque:

```ts
function dirname(path: string | null): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized;
  return normalized.slice(0, idx);
}
```

(Verificar antes que no haya otros usos: `grep -n "dirname" src/modules/source-control/useSourceControlContext.ts` debe quedar sin coincidencias tras borrarla.)

- [ ] **Step 2: El toggle markdown/editor conserva explorerRoot**

En `src/modules/workspaces/lib/useWorkspaces.ts`, dentro de `setPanelView`, sustituir las dos ramas de retorno (lineas 371-376):

```ts
      if (mode === "raw" && p.kind === "markdown" && isMarkdownPath(p.path)) {
        return { id: p.id, kind: "editor", path: p.path, title: p.title, dirty: false, preview: false, explorerRoot: p.explorerRoot };
      }
      if (mode === "rendered" && p.kind === "editor" && isMarkdownPath(p.path)) {
        if (p.dirty) return p;
        return { id: p.id, kind: "markdown", path: p.path, title: p.title, explorerRoot: p.explorerRoot };
      }
```

- [ ] **Step 3: Types, lint y test**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: sin errores, todo verde.

- [ ] **Step 4: Commit**

```bash
git add src/modules/source-control/useSourceControlContext.ts src/modules/workspaces/lib/useWorkspaces.ts
git commit -m "feat(source-control): explorer y git unificados al root recordado del fichero"
```

---

## Verificacion manual final

Arrancar fresco (no via HMR, por el estado mutable de modulo): matar el proceso y `pnpm tauri dev`.

- [ ] Terminal en proyecto X, abrir un fichero de X, hacer `cd` en el terminal a otra carpeta, volver al tab del fichero: el explorer y git muestran X (no la nueva carpeta).
- [ ] Dos terminales en X e Y; abrir `a` desde X y `b` desde Y; alternar entre los tabs `a` y `b`: el explorer salta a X y a Y respectivamente.
- [ ] Editar un tema personalizado (Settings -> tema custom -> editar): su tab muestra `~/.config/kex/themes`, y los ficheros del arbol se colorean (no quedan en blanco).
- [ ] Seleccionar un tab de terminal: el explorer vuelve a seguir el cwd del terminal.
- [ ] Cerrar y reabrir la app: cada tab de fichero recupera su root.
- [ ] Abrir un markdown renderizado, alternar a editor raw y volver: el root se conserva.

## Self-Review (rellenado por el autor del plan)

- Cobertura del spec: modelo (Task 2 Step 1), regla de apertura (Task 1 + Task 2 Step 5/6), resolucion activa (Task 1 + Task 2 Step 4), git unificado (Task 3 Step 1), toggle markdown (Task 3 Step 2), persistencia (sin codigo, verificada en manual), tests puros (Task 1). Todas las secciones del spec tienen tarea.
- Sin placeholders: cada step de codigo incluye el codigo real.
- Consistencia de tipos: `resolveOpenRoot`/`resolveActiveExplorerRoot` se usan con las mismas firmas en Task 2 que las definidas en Task 1; `splitPaneAndOpenFile` gana el 5o parametro en Task 2 Step 2 y se invoca con 5 args en Task 2 Step 6; la prop DnD pasa a 4 args coherente con la llamada existente.
