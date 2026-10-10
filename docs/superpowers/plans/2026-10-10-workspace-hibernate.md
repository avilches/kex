# Workspace hibernado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un workspace puede hibernarse (Cmd+Alt+Z): conserva su estructura de panes y tabs en el JSON, pero no monta ninguna tab ni mantiene procesos, y al despertarlo recupera editores, comandos con Run on start y agentes.

**Architecture:** Flag `hibernated` en `Workspace` con el `paneTree` intacto. Un nucleo puro (`hibernate.ts`, `hibernateReview.ts`) decide transiciones y avisos; `useWorkspaces` expone `hibernateWorkspace`/`wakeWorkspace`; el render pinta el arbol sin tabs mas una capa Zzzzz; un modal reactivo (`HibernateDialog`) gestiona los avisos. Los agentes se reanudan sembrando planes con `previewResumeCmd`/`seedRestorePlan`, el mismo camino que la reapertura de tabs cerradas.

**Tech Stack:** React 19, TypeScript, zustand, Vitest, Tauri 2 (Rust, `cargo test`), shadcn/ui (`AlertDialog`).

**Spec:** `docs/superpowers/specs/2026-10-10-workspace-hibernate-design.md` (tarea TASK-804).

## Global Constraints

- Sin compatibilidad hacia atras: un JSON sin `hibernated` es un workspace despierto, sin migraciones ni shims.
- Sin em-dash, sin emojis, en codigo, comentarios, commits y docs. Mensajes de commit en ingles, de una sola linea, sin `Co-Authored-By` ni marcas de Claude.
- Comentarios: por defecto ninguno; si hace falta, 1-2 lineas sobre el *por que*.
- Imports con `@/...` entre modulos, nunca relativos entre modulos.
- Solo `pnpm`. Comprobaciones: `pnpm lint`, `pnpm check-types`, `pnpm test`, y para Rust `cd src-tauri && cargo clippy && cargo test --locked`.
- Atajos solo en el registry `SHORTCUTS` (`src/modules/shortcuts/shortcuts.ts`), nunca hardcodeados en un handler.
- IDs de entidades con `nid()` prefijados de `src/lib/ids.ts`; este plan no crea entidades nuevas.
- Componentes de formulario siempre de shadcn (`Button`, `AlertDialog`...), nunca HTML nativo con estilos ad-hoc.
- Cualquier cambio de logica nuclear lleva un test que fija el invariante.
- Trabajo en el worktree `.claude/worktrees/workspace-hibernate`; no tocar el checkout principal.
- Documentacion viva en el mismo commit que el cambio de codigo (`AGENTS.md`): cada tarea actualiza las docs que toca.

## Review Focus

1. Matar un PTY con un agente armado no debe borrar su registro en `agent-sessions.json`. Test: `detachesRecord("exited", true) === false` y `true` para una tab normal. Mas el test Rust de supervivencia.
2. Un documento con autosave desactivado deja su buffer en `unflushedBuffers` al desmontarse; al despertar no debe resucitar. Test de `discardUnflushedBuffers`.
3. Una sesion de agente que muere sin que su senal llegue (el PTY se descarta antes) no debe dejar un spinner fantasma en la WorkspaceBar. Test: hibernar llama a `finish` para cada terminal.
4. Un agente con spinner que ademas no tiene Run on start no debe salir duplicado en dos listas del modal. Test en `hibernateReview`.
5. Una terminal de script del RunButton con comando en marcha no debe avisar ni ofrecer Run on start. Test en `hibernateReview`.
6. Una ventana flotante de navegador de un workspace hibernado no debe resucitar al reiniciar ni quedar huerfana al despertar. Test: `applyHibernate` pone `floating: false`.
7. Con el workspace activo hibernado, los atajos de tabs, terminal y editor no deben actuar sobre tabs invisibles. Test de `shortcutsDisabled` (funcion pura extraida).
8. El modal y el runtime deben coincidir en que significa "Run on start": en ejecucion (`useTerminalSession.ts`, `runOnStart = restoreOnRestart !== false`) un comando solo se relanza si hay plan de agente o `persistentCommand`. Tests de `hibernateReview` para `restoreOnRestart` indefinido con y sin `persistentCommand`.
9. Dos disparos seguidos de hibernar (el efecto del modal se redispara al limpiar las sesiones) no deben hibernar dos veces. Test de `useHibernateFlow`.
10. Las notificaciones y la lista anidada de la WorkspaceBar no deben referirse a tabs de un workspace hibernado.

---

## File Structure

| Fichero | Accion | Responsabilidad |
|---|---|---|
| `src/modules/workspaces/lib/types.ts` | Modificar | Campo `hibernated?: boolean` en `Workspace` |
| `src/modules/workspaces/lib/hibernate.ts` | Crear | Nucleo puro: `stripTabs`, `applyHibernate`, `applyWake`, `terminalTabs`, `editorTabIds`, `enableRunOnStart` |
| `src/modules/workspaces/lib/hibernate.test.ts` | Crear | Tests del nucleo |
| `src/modules/workspaces/lib/hibernateReview.ts` | Crear | Funcion pura `hibernateReview` y tipos de filas del modal |
| `src/modules/workspaces/lib/hibernateReview.test.ts` | Crear | Tests de los avisos |
| `src/modules/agents/lib/hibernatingTabs.ts` | Crear | Conjunto en memoria de tabs hibernando |
| `src/modules/agents/lib/hibernatingTabs.test.ts` | Crear | Tests del conjunto |
| `src/modules/agents/lib/sessionEndPolicy.ts` | Modificar | `detachesRecord(kind, hibernating)` |
| `src/modules/agents/lib/sessionEndPolicy.test.ts` | Modificar | Tests de `detachesRecord` |
| `src/modules/agents/components/AgentNotificationsBridge.tsx` | Modificar | Usar `detachesRecord` |
| `src-tauri/src/modules/window_state.rs` | Modificar | Test: workspace hibernado cuenta en `terminal_tab_ids` |
| `src/modules/workspaces/lib/useWorkspaces.ts` | Modificar | `hibernateWorkspace`, `wakeWorkspace` |
| `src/modules/workspaces/lib/useWorkspaces.test.ts` | Modificar | Tests de la transicion |
| `src/modules/editor/lib/unflushedBuffers.ts` | Crear | Mapa de buffers sin guardar por tabId y `discardUnflushedBuffers` (extraido de `useDocument.ts`) |
| `src/modules/editor/lib/unflushedBuffers.test.ts` | Crear | Tests sin mocks |
| `src/modules/editor/lib/useDocument.ts` | Modificar | Importar el mapa extraido |
| `src/modules/shortcuts/shortcuts.test.ts` | Modificar | Test del atajo `workspace.hibernate` |
| `src/modules/workspaces/lib/useHibernateFlow.test.ts` | Crear | Tests de la fabrica `createHibernateFlow` |
| `src/modules/workspaces/WorkspaceView.tsx` | Modificar | Arbol sin tabs + `HibernatedOverlay` |
| `src/modules/workspaces/HibernatedOverlay.tsx` | Crear | Capa Zzzzz con boton Restore |
| `src/modules/workspaces/SplitNodeView.tsx` | Modificar | Propagar `hibernated` a `PaneView` |
| `src/modules/workspaces/PaneView.tsx` | Modificar | Render vacio si `hibernated` |
| `src/app/App.tsx` | Modificar | Barrido de sesiones, lista anidada y ubicaciones de tabs sin hibernados, `shortcutsDisabled`, atajo, wiring del flujo y del modal |
| `src/app/components/HibernateDialog.tsx` | Crear | Modal reactivo reutilizable |
| `src/modules/workspaces/lib/useHibernateFlow.ts` | Crear | Orquestacion: pedir, revisar, hibernar |
| `src/modules/shortcuts/shortcuts.ts` | Modificar | Atajo `workspace.hibernate` |
| `docs/ARCHITECTURE.md`, `docs/WORKSPACES.md`, `docs/AGENT_SESSION_RESTORE.md`, `docs/FORK.md`, `CLAUDE.md` | Modificar | Documentacion y glosario, repartida en el commit de cada tarea |

---

### Task 1: Nucleo puro (modelo, transiciones, avisos)

**Files:**
- Modify: `src/modules/workspaces/lib/types.ts`
- Create: `src/modules/workspaces/lib/hibernate.ts`, `src/modules/workspaces/lib/hibernate.test.ts`
- Create: `src/modules/workspaces/lib/hibernateReview.ts`, `src/modules/workspaces/lib/hibernateReview.test.ts`

**Interfaces:**
- Produces (`hibernate.ts`):
  - `stripTabs(node: SplitNode): SplitNode`
  - `strippedTree(node: SplitNode): SplitNode` (igual que `stripTabs` pero cacheado por identidad del nodo, para no romper el `memo` de `SplitNodeView`)
  - `blockedWhileHibernated(id: ShortcutId): boolean`
  - `applyHibernate(workspaces: Workspace[], workspaceId: string): Workspace[]`
  - `applyWake(workspaces: Workspace[], workspaceId: string): Workspace[]`
  - `terminalTabs(ws: Workspace): Extract<Tab, { kind: "terminal" }>[]`
  - `editorTabIds(ws: Workspace): string[]` (tabs `editor` y `markdown`)
  - `enableRunOnStart(tab: Tab, runningCommand?: string): Tab`
- Produces (`hibernateReview.ts`):
  - `type HibernateLive = { agentOf: (tabId: string) => { agent: string; status: AgentStatus } | undefined; runningCommand: (tabId: string) => string | undefined }`
  - `type HibernateReview = { agents: AgentRow[]; docs: DocRow[]; commands: CommandRow[] }`
  - `hibernateReview(ws: Workspace, live: HibernateLive): HibernateReview`
  - `isReviewEmpty(r: HibernateReview): boolean`
- Consumes: `allPanes` de `./splitNode`; `AgentStatus` de `@/modules/agents/lib/types`.

- [ ] **Step 1: Anadir el campo al tipo**

En `src/modules/workspaces/lib/types.ts`, dentro de `Workspace`, tras `detailExpanded?: boolean;`:

```ts
  // The workspace keeps its pane tree and tabs in the JSON but mounts none of
  // them; waking it brings editors, commands and agents back.
  hibernated?: boolean;
```

- [ ] **Step 2: Escribir los tests de `hibernate.ts` (fallan)**

`src/modules/workspaces/lib/hibernate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyHibernate,
  applyWake,
  blockedWhileHibernated,
  editorTabIds,
  enableRunOnStart,
  stripTabs,
  strippedTree,
  terminalTabs,
} from "./hibernate";
import type { SplitNode, Tab, Workspace } from "./types";

const term = (id: string, over: Partial<Extract<Tab, { kind: "terminal" }>> = {}): Tab => ({
  id,
  kind: "terminal",
  ...over,
});
const editor = (id: string, dirty: boolean): Tab => ({
  id,
  kind: "editor",
  path: `/p/${id}.ts`,
  dirty,
  preview: false,
});
const md = (id: string, dirty: boolean): Tab => ({
  id,
  kind: "markdown",
  path: `/p/${id}.md`,
  dirty,
});

const tree: SplitNode = {
  kind: "split",
  id: "s1",
  orientation: "horizontal",
  dividerPosition: 0.4,
  first: { kind: "pane", id: "p1", tabs: [term("t1"), editor("e1", true)], activeTabId: "t1" },
  second: { kind: "pane", id: "p2", tabs: [md("m1", true)], activeTabId: "m1" },
};

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: tree,
  activePaneId: "p1",
  ...over,
});

describe("stripTabs", () => {
  it("keeps the split structure and divider and empties every pane", () => {
    const out = stripTabs(tree);
    expect(out.kind).toBe("split");
    if (out.kind !== "split") return;
    expect(out.dividerPosition).toBe(0.4);
    expect(out.id).toBe("s1");
    expect(out.first).toMatchObject({ kind: "pane", id: "p1", tabs: [], activeTabId: null });
    expect(out.second).toMatchObject({ kind: "pane", id: "p2", tabs: [], activeTabId: null });
  });
});

describe("applyHibernate", () => {
  it("flags only the target workspace and leaves its tab structure intact", () => {
    const out = applyHibernate([ws(), ws({ id: "w2" })], "w1");
    expect(out[0]!.hibernated).toBe(true);
    expect(out[1]!.hibernated).toBeUndefined();
    expect(terminalTabs(out[0]!).map((t) => t.id)).toEqual(["t1"]);
  });

  it("turns off floating on browser tabs so the window is not reopened on restart", () => {
    const b: Tab = { id: "b1", kind: "browser", url: "https://x.test", floating: true };
    const w = ws({ paneTree: { kind: "pane", id: "p1", tabs: [b], activeTabId: "b1" } });
    const out = applyHibernate([w], "w1")[0]!;
    const pane = out.paneTree as Extract<SplitNode, { kind: "pane" }>;
    const tab = pane.tabs[0]!;
    expect(tab.kind === "browser" && tab.floating).toBe(false);
  });

  it("clears dirty on editor and markdown tabs, which are about to be unmounted", () => {
    const out = applyHibernate([ws()], "w1")[0]!;
    const tabs = (out.paneTree as Extract<SplitNode, { kind: "split" }>);
    const e = (tabs.first as Extract<SplitNode, { kind: "pane" }>).tabs[1]!;
    const m = (tabs.second as Extract<SplitNode, { kind: "pane" }>).tabs[0]!;
    expect(e.kind === "editor" && e.dirty).toBe(false);
    expect(m.kind === "markdown" && m.dirty).toBe(false);
  });
});

describe("applyWake", () => {
  it("removes the flag and keeps everything else", () => {
    const hib = applyHibernate([ws()], "w1");
    const out = applyWake(hib, "w1")[0]!;
    expect("hibernated" in out).toBe(false);
    expect(out.paneTree).toEqual(hib[0]!.paneTree);
  });
});

describe("strippedTree", () => {
  it("returns the same reference for the same input tree", () => {
    expect(strippedTree(tree)).toBe(strippedTree(tree));
  });
});

describe("blockedWhileHibernated", () => {
  it("blocks tab, pane, terminal, editor and script shortcuts", () => {
    for (const id of ["tab.new", "tab.close", "pane.splitRight", "terminal.clear", "editor.save", "workspace.run", "search.focus"] as const) {
      expect(blockedWhileHibernated(id)).toBe(true);
    }
  });

  it("lets workspace, window, view and settings shortcuts through", () => {
    for (const id of ["workspace.new", "workspace.next", "window.new", "view.zoomIn", "settings.open"] as const) {
      expect(blockedWhileHibernated(id)).toBe(false);
    }
  });
});

describe("tab selectors", () => {
  it("lists terminals and editor-like tabs across the whole tree", () => {
    expect(terminalTabs(ws()).map((t) => t.id)).toEqual(["t1"]);
    expect(editorTabIds(ws())).toEqual(["e1", "m1"]);
  });
});

describe("enableRunOnStart", () => {
  it("turns it on and adopts the running command when none is saved", () => {
    expect(enableRunOnStart(term("t1"), "npm run dev")).toMatchObject({
      restoreOnRestart: true,
      persistentCommand: "npm run dev",
    });
  });

  it("keeps an already saved persistent command", () => {
    expect(enableRunOnStart(term("t1", { persistentCommand: "make" }), "other")).toMatchObject({
      restoreOnRestart: true,
      persistentCommand: "make",
    });
  });

  it("turns it back on for an agent that had it explicitly off", () => {
    expect(enableRunOnStart(term("t1", { restoreOnRestart: false }), undefined)).toMatchObject({
      restoreOnRestart: true,
    });
  });

  it("ignores non-terminal tabs", () => {
    const e = editor("e1", false);
    expect(enableRunOnStart(e, "x")).toBe(e);
  });
});
```

- [ ] **Step 3: Verlo fallar**

Run: `pnpm test src/modules/workspaces/lib/hibernate.test.ts`
Expected: FAIL (modulo `./hibernate` inexistente).

- [ ] **Step 4: Implementar `hibernate.ts`**

```ts
import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { allPanes } from "./splitNode";
import type { PaneNode, SplitNode, Tab, Workspace } from "./types";

type TerminalTab = Extract<Tab, { kind: "terminal" }>;

export function stripTabs(node: SplitNode): SplitNode {
  if (node.kind === "pane") return { ...node, tabs: [], activeTabId: null };
  return { ...node, first: stripTabs(node.first), second: stripTabs(node.second) };
}

// Editors are about to be unmounted (their unsaved state goes with them) and a
// floating browser window is destroyed, so neither flag may outlive hibernation.
const strippedCache = new WeakMap<SplitNode, SplitNode>();

export function strippedTree(node: SplitNode): SplitNode {
  let out = strippedCache.get(node);
  if (!out) {
    out = stripTabs(node);
    strippedCache.set(node, out);
  }
  return out;
}

// Shortcuts that act on tabs, terminals, editors or scripts have nothing to act
// on while the workspace is asleep (its tabs are in the tree but not mounted).
const BLOCKED_PREFIXES = ["tab.", "pane.", "terminal.", "editor.", "markdown.", "file.", "path."];

export function blockedWhileHibernated(id: ShortcutId): boolean {
  return id === "search.focus" || id === "workspace.run" || BLOCKED_PREFIXES.some((p) => id.startsWith(p));
}

function clearTransientTabState(node: SplitNode): SplitNode {
  if (node.kind === "pane") {
    const pane: PaneNode = {
      ...node,
      tabs: node.tabs.map((t) => {
        if (t.kind === "editor" || t.kind === "markdown") return { ...t, dirty: false };
        if (t.kind === "browser") return { ...t, floating: false };
        return t;
      }),
    };
    return pane;
  }
  return { ...node, first: clearTransientTabState(node.first), second: clearTransientTabState(node.second) };
}

export function applyHibernate(workspaces: Workspace[], workspaceId: string): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId ? { ...w, hibernated: true, paneTree: clearTransientTabState(w.paneTree) } : w,
  );
}

export function applyWake(workspaces: Workspace[], workspaceId: string): Workspace[] {
  return workspaces.map((w) => {
    if (w.id !== workspaceId) return w;
    const { hibernated: _hibernated, ...rest } = w;
    return rest;
  });
}

export function terminalTabs(ws: Workspace): TerminalTab[] {
  return allPanes(ws.paneTree)
    .flatMap((p) => p.tabs)
    .filter((t): t is TerminalTab => t.kind === "terminal");
}

export function editorTabIds(ws: Workspace): string[] {
  return allPanes(ws.paneTree)
    .flatMap((p) => p.tabs)
    .filter((t) => t.kind === "editor" || t.kind === "markdown")
    .map((t) => t.id);
}

export function enableRunOnStart(tab: Tab, runningCommand?: string): Tab {
  if (tab.kind !== "terminal") return tab;
  return {
    ...tab,
    restoreOnRestart: true,
    persistentCommand: tab.persistentCommand ?? runningCommand,
  };
}
```

- [ ] **Step 5: Verlo pasar**

Run: `pnpm test src/modules/workspaces/lib/hibernate.test.ts`
Expected: PASS.

- [ ] **Step 6: Tests de `hibernateReview` (fallan)**

`src/modules/workspaces/lib/hibernateReview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hibernateReview, isReviewEmpty, type HibernateLive } from "./hibernateReview";
import type { Tab, Workspace } from "./types";

const ws = (tabs: Tab[], over: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: { kind: "pane", id: "p1", tabs, activeTabId: tabs[0]?.id ?? null },
  activePaneId: "p1",
  ...over,
});
const term = (id: string, over: Record<string, unknown> = {}): Tab =>
  ({ id, kind: "terminal", ...over }) as Tab;
const live = (
  agents: Record<string, { agent: string; status: "working" | "attention" | "idle" }> = {},
  commands: Record<string, string> = {},
): HibernateLive => ({
  agentOf: (id) => agents[id],
  runningCommand: (id) => commands[id],
});

describe("hibernateReview agents", () => {
  it("lists agents with a spinner even when they have Run on start", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "working" } }));
    expect(r.agents.map((a) => a.tabId)).toEqual(["t1"]);
  });

  it("does not list an idle agent that has Run on start", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "idle" } }));
    expect(isReviewEmpty(r)).toBe(true);
  });

  it("does not list an agent waiting for the user as active", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "attention" } }));
    expect(r.agents).toEqual([]);
  });

  it("does not duplicate a working agent without Run on start in the commands list", () => {
    const r = hibernateReview(
      ws([term("t1", { restoreOnRestart: false })]),
      live({ t1: { agent: "claude", status: "working" } }),
    );
    expect(r.agents.map((a) => a.tabId)).toEqual(["t1"]);
    expect(r.commands).toEqual([]);
  });
});

describe("hibernateReview commands", () => {
  it("lists an idle agent whose Run on start is explicitly off", () => {
    const r = hibernateReview(
      ws([term("t1", { restoreOnRestart: false })]),
      live({ t1: { agent: "claude", status: "idle" } }),
    );
    expect(r.commands).toEqual([{ tabId: "t1", title: undefined, command: "claude" }]);
  });

  it("lists a plain terminal running a command without Run on start", () => {
    const r = hibernateReview(ws([term("t1")]), live({}, { t1: "npm run dev" }));
    expect(r.commands.map((c) => c.command)).toEqual(["npm run dev"]);
  });

  it("lists a terminal that has a persistent command but Run on start explicitly off", () => {
    const r = hibernateReview(
      ws([term("t1", { persistentCommand: "make watch", restoreOnRestart: false })]),
      live(),
    );
    expect(r.commands.map((c) => c.command)).toEqual(["make watch"]);
  });

  it("does not list a terminal whose persistent command replays on its own (restoreOnRestart unset)", () => {
    const r = hibernateReview(ws([term("t1", { persistentCommand: "make watch" })]), live({}, { t1: "make watch" }));
    expect(isReviewEmpty(r)).toBe(true);
  });

  it("lists a terminal with Run on start on but no command saved, since nothing would replay", () => {
    const r = hibernateReview(ws([term("t1", { restoreOnRestart: true })]), live({}, { t1: "npm run dev" }));
    expect(r.commands.map((c) => c.command)).toEqual(["npm run dev"]);
  });

  it("does not list a terminal with Run on start and a saved command", () => {
    const r = hibernateReview(
      ws([term("t1", { restoreOnRestart: true, persistentCommand: "make" })]),
      live({}, { t1: "make" }),
    );
    expect(isReviewEmpty(r)).toBe(true);
  });

  it("does not list an empty shell", () => {
    expect(isReviewEmpty(hibernateReview(ws([term("t1")]), live()))).toBe(true);
  });

  it("skips RunButton script terminals even with a command running", () => {
    const w = ws([term("t1")], { scripts: [{ id: "s1", name: "dev", command: "npm run dev", tabId: "t1" }] });
    expect(isReviewEmpty(hibernateReview(w, live({}, { t1: "npm run dev" })))).toBe(true);
  });
});

describe("hibernateReview docs", () => {
  it("lists dirty editor and markdown tabs only", () => {
    const tabs: Tab[] = [
      { id: "e1", kind: "editor", path: "/a.ts", dirty: true, preview: false },
      { id: "e2", kind: "editor", path: "/b.ts", dirty: false, preview: false },
      { id: "m1", kind: "markdown", path: "/c.md", dirty: true },
      { id: "m2", kind: "markdown", path: "/d.md" },
    ];
    const r = hibernateReview(ws(tabs), live());
    expect(r.docs.map((d) => d.tabId)).toEqual(["e1", "m1"]);
    expect(r.docs[0]).toMatchObject({ path: "/a.ts" });
  });
});
```

- [ ] **Step 7: Verlo fallar**

Run: `pnpm test src/modules/workspaces/lib/hibernateReview.test.ts`
Expected: FAIL (modulo inexistente).

- [ ] **Step 8: Implementar `hibernateReview.ts`**

```ts
import type { AgentStatus } from "@/modules/agents/lib/types";
import { allPanes } from "./splitNode";
import type { Tab, Workspace } from "./types";

export type HibernateLive = {
  agentOf: (tabId: string) => { agent: string; status: AgentStatus } | undefined;
  runningCommand: (tabId: string) => string | undefined;
};

export type AgentRow = { tabId: string; title: string | undefined; agent: string };
export type DocRow = { tabId: string; title: string | undefined; path: string };
export type CommandRow = { tabId: string; title: string | undefined; command: string };
export type HibernateReview = { agents: AgentRow[]; docs: DocRow[]; commands: CommandRow[] };

export function isReviewEmpty(r: HibernateReview): boolean {
  return r.agents.length === 0 && r.docs.length === 0 && r.commands.length === 0;
}

// Mirrors what useTerminalSession does on spawn: with restoreOnRestart not
// explicitly off, an agent resumes from its stored session and a plain terminal
// replays its persistentCommand. Anything else comes back as an empty shell.
function comesBack(tab: Extract<Tab, { kind: "terminal" }>, isAgent: boolean): boolean {
  if (tab.restoreOnRestart === false) return false;
  return isAgent || !!tab.persistentCommand;
}

export function hibernateReview(ws: Workspace, live: HibernateLive): HibernateReview {
  const scriptTabs = new Set((ws.scripts ?? []).map((s) => s.tabId).filter((id): id is string => !!id));
  const review: HibernateReview = { agents: [], docs: [], commands: [] };

  for (const tab of allPanes(ws.paneTree).flatMap((p) => p.tabs)) {
    if (tab.kind === "editor" || tab.kind === "markdown") {
      if (tab.dirty) review.docs.push({ tabId: tab.id, title: tab.title, path: tab.path });
      continue;
    }
    if (tab.kind !== "terminal") continue;

    const agent = live.agentOf(tab.id);
    if (agent?.status === "working") {
      review.agents.push({ tabId: tab.id, title: tab.title, agent: agent.agent });
      continue;
    }
    if (scriptTabs.has(tab.id)) continue;
    if (comesBack(tab, agent !== undefined)) continue;
    const command = live.runningCommand(tab.id) ?? tab.persistentCommand ?? agent?.agent;
    if (!command) continue;
    review.commands.push({ tabId: tab.id, title: tab.title, command });
  }
  return review;
}
```

- [ ] **Step 9: Verlo pasar y comprobar tipos**

Run: `pnpm test src/modules/workspaces/lib/hibernateReview.test.ts src/modules/workspaces/lib/hibernate.test.ts && pnpm check-types && pnpm lint`
Expected: PASS, sin errores.

- [ ] **Step 10: Commit**

```bash
git add src/modules/workspaces/lib/types.ts src/modules/workspaces/lib/hibernate.ts src/modules/workspaces/lib/hibernate.test.ts src/modules/workspaces/lib/hibernateReview.ts src/modules/workspaces/lib/hibernateReview.test.ts
git commit -m "Add pure core for hibernated workspaces"
```

---

### Task 2: Proteccion del registro de sesion de agentes

**Files:**
- Create: `src/modules/agents/lib/hibernatingTabs.ts`, `src/modules/agents/lib/hibernatingTabs.test.ts`
- Modify: `src/modules/agents/lib/sessionEndPolicy.ts`, `src/modules/agents/lib/sessionEndPolicy.test.ts`
- Modify: `src/modules/agents/components/AgentNotificationsBridge.tsx` (linea ~135)
- Modify: `src-tauri/src/modules/window_state.rs` (modulo de tests, junto a `terminal_tab_ids_survives_an_empty_window`)
- Modify: `docs/AGENT_SESSION_RESTORE.md`

**Interfaces:**
- Produces: `markHibernating(tabIds: Iterable<string>): void`, `unmarkHibernating(tabIds: Iterable<string>): void`, `isHibernating(tabId: string): boolean`, `detachesRecord(kind: AgentSignal["kind"], hibernating: boolean): boolean`.
- Consumes: `endsAgentSession` (ya existe).

Contexto: hoy `disposeSession` borra la sesion del mapa `sessions` de forma sincrona y la senal `exited` llega despues, asi que `leafIdForPty` ya devuelve `null` y no se llega a borrar el registro. Eso es una dependencia de orden implicita; este conjunto la vuelve explicita.

- [ ] **Step 1: Tests (fallan)**

`src/modules/agents/lib/hibernatingTabs.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { isHibernating, markHibernating, unmarkHibernating } from "./hibernatingTabs";

describe("hibernatingTabs", () => {
  beforeEach(() => unmarkHibernating(["a", "b", "c"]));

  it("tracks marked tabs and releases only the ones asked", () => {
    markHibernating(["a", "b"]);
    expect(isHibernating("a")).toBe(true);
    unmarkHibernating(["a"]);
    expect(isHibernating("a")).toBe(false);
    expect(isHibernating("b")).toBe(true);
  });

  it("does not report unknown tabs", () => {
    expect(isHibernating("c")).toBe(false);
  });
});
```

Anadir a `sessionEndPolicy.test.ts` (importar `detachesRecord`):

```ts
describe("detachesRecord", () => {
  it("drops the stored record when the agent exits on a normal tab", () => {
    expect(detachesRecord("exited", false)).toBe(true);
  });

  it("keeps the record when the exit comes from hibernating the workspace", () => {
    expect(detachesRecord("exited", true)).toBe(false);
  });

  it("never drops it for signals that do not end the session", () => {
    expect(detachesRecord("Stop", false)).toBe(false);
  });
});
```

- [ ] **Step 2: Verlos fallar**

Run: `pnpm test src/modules/agents/lib/hibernatingTabs.test.ts src/modules/agents/lib/sessionEndPolicy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/modules/agents/lib/hibernatingTabs.ts`:

```ts
// Tabs whose PTY is being killed because their workspace is hibernating. The exit
// that follows must not delete the agent's stored session: waking needs it.
const hibernating = new Set<string>();

export function markHibernating(tabIds: Iterable<string>): void {
  for (const id of tabIds) hibernating.add(id);
}

export function unmarkHibernating(tabIds: Iterable<string>): void {
  for (const id of tabIds) hibernating.delete(id);
}

export function isHibernating(tabId: string): boolean {
  return hibernating.has(tabId);
}
```

En `sessionEndPolicy.ts`, anadir:

```ts
export function detachesRecord(kind: AgentSignal["kind"], hibernating: boolean): boolean {
  return endsAgentSession(kind) && !hibernating;
}
```

En `AgentNotificationsBridge.tsx`, importar `detachesRecord` junto a `endsAgentSession` e `isHibernating` desde `../lib/hibernatingTabs`, y cambiar el bloque de `handleSignal`:

```ts
  if (endsAgentSession(sig.kind)) {
    store.finish(tabId);
    if (detachesRecord(sig.kind, isHibernating(tabId))) {
      invoke("agent_detach_session", { tabId }).catch(() => {});
    }
  }
```

- [ ] **Step 4: Test Rust de supervivencia (regresion)**

En `window_state.rs`, dentro del `mod tests`, tras `terminal_tab_ids_survives_an_empty_window`:

```rust
    #[test]
    fn terminal_tab_ids_includes_hibernated_workspaces() {
        let dir = TempDir::new().unwrap();
        let mgr = WindowStateManager::new(dir.path().join("state.json"));
        mgr.add_window("w-main".to_string());
        let mut ws = ws_with_tabs(&[("tab-a", "terminal")]);
        ws[0]["hibernated"] = serde_json::json!(true);
        mgr.update_workspace("w-main", ws, 0);

        assert_eq!(mgr.terminal_tab_ids(), HashSet::from(["tab-a".to_string()]));
    }
```

- [ ] **Step 5: Ejecutar todo**

Run: `pnpm test src/modules/agents && pnpm check-types && pnpm lint && cd src-tauri && cargo test --locked terminal_tab_ids && cargo clippy`
Expected: PASS. (El test Rust pasa desde el primer momento: es una regresion que fija un invariante existente.)

- [ ] **Step 6: Documentar en este mismo commit**

En `docs/AGENT_SESSION_RESTORE.md`, anadir una seccion "Hibernating a workspace": `hibernatingTabs`, `detachesRecord`, y la dependencia de orden que hoy protege el registro (`disposeSession` descarta la sesion de forma sincrona y `leafIdForPty` devuelve `null` cuando llega `exited`; el conjunto lo vuelve explicito).

- [ ] **Step 7: Commit**

```bash
git add src/modules/agents src-tauri/src/modules/window_state.rs docs/AGENT_SESSION_RESTORE.md
git commit -m "Keep agent session records when a workspace hibernates"
```

---

### Task 3: Transicion en `useWorkspaces`, descarte de buffers y render

**Files:**
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts`, `src/modules/workspaces/lib/useWorkspaces.test.ts`
- Create: `src/modules/editor/lib/unflushedBuffers.ts`, `src/modules/editor/lib/unflushedBuffers.test.ts`
- Modify: `src/modules/editor/lib/useDocument.ts`
- Create: `src/modules/workspaces/HibernatedOverlay.tsx`
- Modify: `src/modules/workspaces/WorkspaceView.tsx`, `SplitNodeView.tsx`, `PaneView.tsx`
- Modify: `src/app/App.tsx` (barrido de sesiones ~640-675; `setTabLocations` ~2947; `shortcutsDisabled` ~2911; `workspaceBarItems` ~3153; `runWorkspaceConfig` ~708)
- Modify: `docs/ARCHITECTURE.md`, `docs/WORKSPACES.md`

**Interfaces:**
- Consumes (Task 1): `applyHibernate`, `applyWake`, `strippedTree`, `terminalTabs`, `editorTabIds`, `blockedWhileHibernated`. (Task 2): `unmarkHibernating`.
- Produces: `useWorkspaces()` devuelve ademas `hibernateWorkspace(workspaceId: string): void` y `wakeWorkspace(workspaceId: string): Promise<void>`. `seedWakePlans(ws, lookup, seed): Promise<void>` exportada y pura. `unflushedBuffers.ts` exporta `stashUnflushedBuffer(tabId, text)`, `takeUnflushedBuffer(tabId): string | undefined`, `hasUnflushedBuffer(tabId)`, `discardUnflushedBuffers(tabIds)`. `WorkspaceView` recibe la prop nueva `onWake: (workspaceId: string) => void`.

- [ ] **Step 1: Extraer los buffers sin guardar (TDD)**

`src/modules/editor/lib/unflushedBuffers.test.ts` (sin mocks; `useDocument.test.ts` mockea tauri y sonner y no hace falta arrastrarlos):

```ts
import { describe, expect, it } from "vitest";
import {
  discardUnflushedBuffers,
  hasUnflushedBuffer,
  stashUnflushedBuffer,
  takeUnflushedBuffer,
} from "./unflushedBuffers";

describe("unflushedBuffers", () => {
  it("returns and removes a stashed buffer", () => {
    stashUnflushedBuffer("t1", "text");
    expect(takeUnflushedBuffer("t1")).toBe("text");
    expect(hasUnflushedBuffer("t1")).toBe(false);
  });

  it("discards the carried edits of the given tabs only", () => {
    stashUnflushedBuffer("t1", "a");
    stashUnflushedBuffer("t2", "b");
    discardUnflushedBuffers(["t1"]);
    expect(hasUnflushedBuffer("t1")).toBe(false);
    expect(hasUnflushedBuffer("t2")).toBe(true);
    discardUnflushedBuffers(["t2"]);
  });
});
```

Run: `pnpm test src/modules/editor/lib/unflushedBuffers.test.ts`. Expected: FAIL (modulo inexistente).

`src/modules/editor/lib/unflushedBuffers.ts`:

```ts
// An editor unmounted with unsaved edits and autosave off carries them here, keyed
// by tab id, so the same tab remounting picks them up again.
const buffers = new Map<string, string>();

export function stashUnflushedBuffer(tabId: string, text: string): void {
  buffers.set(tabId, text);
}

export function takeUnflushedBuffer(tabId: string): string | undefined {
  const text = buffers.get(tabId);
  buffers.delete(tabId);
  return text;
}

export function hasUnflushedBuffer(tabId: string): boolean {
  return buffers.has(tabId);
}

export function discardUnflushedBuffers(tabIds: Iterable<string>): void {
  for (const id of tabIds) buffers.delete(id);
}
```

En `useDocument.ts`: borrar `const unflushedBuffers = new Map<string, string>();` (linea 24), importar el modulo nuevo, sustituir en la linea ~112-113 `const unflushed = unflushedBuffers.get(tabId); unflushedBuffers.delete(tabId);` por `const unflushed = takeUnflushedBuffer(tabId);` y en la linea ~294 `unflushedBuffers.set(tabId, bufferRef.current)` por `stashUnflushedBuffer(tabId, bufferRef.current)`. Run: `pnpm test src/modules/editor` (incluye `useDocument.test.ts`). Expected: PASS.

- [ ] **Step 2: Tests de despertar en `useWorkspaces.test.ts` (fallan)**

Anadir (importar `planWake` y `seedWakePlans` en el import existente):

```ts
describe("planWake", () => {
  it("asks for a resume plan only on terminals that did not opt out of Run on start", () => {
    const w = ws({
      paneTree: {
        kind: "pane",
        id: "p1",
        activeTabId: "a",
        tabs: [
          { id: "a", kind: "terminal" },
          { id: "b", kind: "terminal", restoreOnRestart: false },
          { id: "c", kind: "editor", path: "/x", dirty: false, preview: false },
        ],
      },
    });
    expect(planWake(w)).toEqual(["a"]);
  });
});

describe("seedWakePlans", () => {
  const plan = { tabId: "a", agent: "claude", resumeCmd: "claude --resume x", cwdLaunch: "/p", errorReason: "" };

  it("seeds the plan under the same tab id for each terminal that has one", async () => {
    const seeded: [string, unknown][] = [];
    const w = ws({
      paneTree: {
        kind: "pane",
        id: "p1",
        activeTabId: "a",
        tabs: [
          { id: "a", kind: "terminal" },
          { id: "b", kind: "terminal" },
        ],
      },
    });
    await seedWakePlans(
      w,
      async (id) => (id === "a" ? plan : null),
      (id, p) => seeded.push([id, p]),
    );
    expect(seeded).toEqual([["a", plan]]);
  });

  it("does not look up terminals that opted out", async () => {
    const asked: string[] = [];
    const w = ws({
      paneTree: {
        kind: "pane",
        id: "p1",
        activeTabId: "a",
        tabs: [{ id: "a", kind: "terminal", restoreOnRestart: false }],
      },
    });
    await seedWakePlans(w, async (id) => (asked.push(id), null), () => {});
    expect(asked).toEqual([]);
  });
});
```

Run: `pnpm test src/modules/workspaces/lib/useWorkspaces.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar en `useWorkspaces.ts`**

Imports nuevos: `import { applyHibernate, applyWake, editorTabIds, terminalTabs } from "./hibernate";`, `import { unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";`, `import { discardUnflushedBuffers } from "@/modules/editor/lib/unflushedBuffers";`, y el tipo `RestorePlan` de `@/modules/agents/lib/agentSessionRestore` (ya se importan `previewResumeCmd` y `seedRestorePlan` de ahi).

Junto a `needsResumePlanLookup`:

```ts
export function planWake(ws: Workspace): string[] {
  return terminalTabs(ws).filter(needsResumePlanLookup).map((t) => t.id);
}

export async function seedWakePlans(
  ws: Workspace,
  lookup: (tabId: string) => Promise<RestorePlan | null>,
  seed: (tabId: string, plan: RestorePlan) => void,
): Promise<void> {
  await Promise.all(
    planWake(ws).map(async (tabId) => {
      const plan = await lookup(tabId);
      if (plan) seed(tabId, plan);
    }),
  );
}
```

Dentro del hook, antes de `// ── Derived`:

```ts
  const hibernateWorkspace = useCallback((workspaceId: string) => {
    setWorkspaces((prev) => applyHibernate(prev, workspaceId));
  }, []);

  const wakeWorkspace = useCallback(async (workspaceId: string) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    if (!ws?.hibernated) return;
    await seedWakePlans(ws, previewResumeCmd, seedRestorePlan);
    discardUnflushedBuffers(editorTabIds(ws));
    unmarkHibernating(terminalTabs(ws).map((t) => t.id));
    setWorkspaces((prev) => applyWake(prev, workspaceId));
  }, []);
```

Anadir `hibernateWorkspace, wakeWorkspace` al objeto devuelto. Ademas, `openTab` y `splitPaneAndOpenTab` no deben anadir tabs a un workspace hibernado (por ejemplo al abrir un fichero desde el explorer con el Sidebar a la vista): al principio de cada callback, leer `workspacesRef.current.find(...)` y, si `hibernated`, devolver sin hacer nada (`null` en `splitPaneAndOpenTab`, que ya devuelve un id de pane; seguir el contrato existente de "split bloqueado").

Run: `pnpm test src/modules/workspaces/lib/useWorkspaces.test.ts`. Expected: PASS.

- [ ] **Step 4: Capa `HibernatedOverlay.tsx`**

```tsx
import { Button } from "@/components/ui/button";

type Props = { onWake: () => void; active: boolean };

export function HibernatedOverlay({ onWake, active }: Props) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/95 text-muted-foreground">
      <span className="select-none text-5xl font-light tracking-widest">Zzzzz</span>
      <Button variant="outline" size="sm" onClick={onWake} autoFocus={active}>
        Restore
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Render en `WorkspaceView.tsx`, `SplitNodeView.tsx`, `PaneView.tsx`**

`WorkspaceView.tsx`: importar `strippedTree` y `HibernatedOverlay`; anadir a `Props` `onWake: (workspaceId: string) => void;` y desestructurarlo para que no viaje en `...rest`. En el `map` de workspaces, pasar `node={ws.hibernated ? strippedTree(ws.paneTree) : ws.paneTree}` y `hibernated={ws.hibernated}`, y dentro del `div` del workspace tras el `SplitNodeView`: `{ws.hibernated && <HibernatedOverlay active={ws.id === activeWorkspaceId} onWake={() => onWake(ws.id)} />}`.

`SplitNodeView.tsx`: anadir `hibernated?: boolean` a `Props` y pasar `hibernated={rest.hibernated}` a `<PaneView>` (los hijos recursivos ya reciben `{...rest}`).

`PaneView.tsx`: anadir `hibernated?: boolean` a `Props`; colocar `if (hibernated) return <div className="h-full w-full border border-border" />;` DESPUES del ultimo hook y justo antes del `return` principal (alrededor de la linea 280; el revisor verifico que no hay hooks despues).

- [ ] **Step 6: Efectos en `App.tsx`**

1. Barrido de sesiones (~linea 640-675). Al construir `live`, saltar hibernados para que sus terminales se destruyan por el camino normal:

```ts
    for (const ws of workspaces) {
      if (ws.hibernated) continue;
```

   Dentro de `if (!live.has(id))`, antes de `disposeSession(id)`, anadir `useAgentStore.getState().finish(id);`. Es un cambio de comportamiento deliberado para cualquier terminal descartada (cerrar, mover de ventana, hibernar): la senal `exited` llega con la sesion ya descartada y `leafIdForPty` devuelve `null`, asi que sin esto quedaria un spinner fantasma. Es inocuo al reabrir una tab cerrada porque `stashClosedSession` ya se ejecuto antes en `closeTab`.
2. `setTabLocations` (~linea 2947): pasar solo los workspaces despiertos, `setTabLocations(tabLocations(workspaces.filter((w) => !w.hibernated)))`, para que las notificaciones de agentes de un workspace dormido no apunten a tabs que no existen en pantalla.
3. `workspaceBarItems` (~linea 3153): `tabs: w.detailExpanded && !w.hibernated ? allPanes(w.paneTree).flatMap((p) => p.tabs) : NO_TABS`. No hay nada que cambiar en `WorkspaceBar.tsx`.
4. `shortcutsDisabled` (~linea 2911): al principio, `if (activeWorkspace?.hibernated && blockedWhileHibernated(id)) return true;` (importar de `@/modules/workspaces/lib/hibernate`).
5. `runWorkspaceConfig` (~linea 708): `if (!activeWorkspace || activeWorkspace.hibernated) return;` para que el RunButton no cree terminales en un workspace dormido.
6. Pasar `onWake={(id) => void wakeWorkspace(id)}` a `<WorkspaceView>` y obtener `hibernateWorkspace`/`wakeWorkspace` del `useWorkspaces()` ya destructurado.

- [ ] **Step 7: Documentar en este mismo commit**

`docs/ARCHITECTURE.md`: el campo `Workspace.hibernated`, por que las tabs permanecen en el JSON, y las limitaciones (los scripts del RunButton no se relanzan solos al despertar; un agente que no pueda reanudarse sigue el camino de error existente). `docs/WORKSPACES.md`: render del workspace hibernado (`strippedTree`, `HibernatedOverlay`, exclusion del barrido de sesiones, el `finish` del barrido) y los guardas (`openTab`, `shortcutsDisabled`, `runWorkspaceConfig`).

- [ ] **Step 8: Comprobaciones**

Run: `pnpm test && pnpm check-types && pnpm lint`
Expected: PASS.

- [ ] **Step 9: Verificacion manual del render**

Con la app cerrada, poner `"hibernated": true` en uno de los `user-data/support-dev/workspaces/<id>.json` (cambio local, no se commitea), ejecutar `pnpm tauri dev` desde el worktree y comprobar: panes y divisores visibles, ninguna tab, capa Zzzzz, boton Restore despierta y las tabs vuelven; no hay PTY de ese workspace (`Kex.log` de `user-data/logs-dev`); la lista anidada de la WorkspaceBar esta vacia; abrir un fichero desde el explorer con ese workspace activo no anade tabs; F12 no lanza el script.

- [ ] **Step 10: Commit**

```bash
git add -A src docs
git commit -m "Render hibernated workspaces and wake them from the overlay"
```

---

### Task 4: Flujo de hibernar, modal y atajo

**Files:**
- Create: `src/modules/workspaces/lib/useHibernateFlow.ts`, `src/modules/workspaces/lib/useHibernateFlow.test.ts`
- Create: `src/app/components/HibernateDialog.tsx`
- Modify: `src/modules/shortcuts/shortcuts.ts`, `src/modules/shortcuts/shortcuts.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `docs/WORKSPACES.md`, `docs/FORK.md`, `CLAUDE.md` (glosario)

**Interfaces:**
- Consumes (Tasks 1-3): `hibernateReview`, `isReviewEmpty`, `HibernateLive`, `enableRunOnStart`, `terminalTabs`, `hibernateWorkspace`, `markHibernating`, `useAgentStore`, `getRunningCommandsSnapshot`, `subscribeToRunningCommands`.
- Produces: `createHibernateFlow(deps): { request(workspaceId): Promise<void>; perform(workspaceId): Promise<void> }` (sin React, testeable) y `useHibernateFlow(deps)`, que devuelve `{ pendingWorkspaceId: string | null; requestHibernate(id): Promise<void>; performHibernate(id): Promise<void>; cancel(): void }`. `HibernateDialog` props: `{ workspace: Workspace | null; onClose(): void; onHibernate(): void; onSaveTab(tabId: string): Promise<void>; onSaveAll(tabIds: string[]): Promise<void>; onEnableRunOnStart(tabId: string, runningCommand?: string): void }`.

- [ ] **Step 1: Atajo y su test**

En `shortcuts.ts`: anadir `| "workspace.hibernate"` al union `ShortcutId` (junto a `workspace.run`) y la entrada:

```ts
  {
    id: "workspace.hibernate",
    label: "Hibernate Workspace",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "z" }],
  },
```

Seguir el patron de `alt+b`, `alt+h` y `alt+n` ya existentes (`matchBinding` usa `e.code` cuando el binding lleva `alt`). Test en `shortcuts.test.ts` (importar `SHORTCUTS` y `MOD_PROP` como hace el resto del archivo):

```ts
describe("workspace.hibernate", () => {
  it("is registered on Mod+Alt+Z and nothing else uses that chord", () => {
    const sc = SHORTCUTS.find((s) => s.id === "workspace.hibernate");
    expect(sc?.defaultBindings).toEqual([{ [MOD_PROP]: true, alt: true, key: "z" }]);
    const clashes = SHORTCUTS.filter(
      (s) =>
        s.id !== "workspace.hibernate" &&
        s.defaultBindings.some((b) => b.key === "z" && b.alt && b[MOD_PROP]),
    );
    expect(clashes).toEqual([]);
  });

  it("stays usable while the workspace is hibernated, so it can be toggled", () => {
    expect(blockedWhileHibernated("workspace.hibernate")).toBe(false);
  });
});
```

(importar `blockedWhileHibernated` de `@/modules/workspaces/lib/hibernate`).

Run: `pnpm test src/modules/shortcuts`. Expected: PASS (tras anadir la entrada; antes FAIL).

- [ ] **Step 2: Tests de la fabrica de flujo (fallan)**

`src/modules/workspaces/lib/useHibernateFlow.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { isHibernating, unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { createHibernateFlow, type HibernateFlowDeps } from "./useHibernateFlow";
import type { Tab, Workspace } from "./types";

const term = (id: string, over: Record<string, unknown> = {}): Tab => ({ id, kind: "terminal", ...over }) as Tab;
const ws = (tabs: Tab[], over: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: { kind: "pane", id: "p1", tabs, activeTabId: tabs[0]?.id ?? null },
  activePaneId: "p1",
  ...over,
});

function setup(workspace: Workspace, over: Partial<HibernateFlowDeps> = {}) {
  const calls: string[] = [];
  const deps: HibernateFlowDeps = {
    getWorkspace: () => workspace,
    autosaveEnabled: () => false,
    flushDirtyEditors: async () => void calls.push("flush"),
    settle: async () => void calls.push("settle"),
    live: () => ({ agentOf: () => undefined, runningCommand: () => undefined }),
    finishAgent: (id) => void calls.push(`finish:${id}`),
    destroyFloats: async () => void calls.push("floats"),
    hibernate: () => void calls.push("hibernate"),
    setPending: (id) => void calls.push(`pending:${id}`),
    ...over,
  };
  return { flow: createHibernateFlow(deps), calls };
}

describe("createHibernateFlow", () => {
  beforeEach(() => unmarkHibernating(["t1", "t2"]));

  it("hibernates straight away when there is nothing to warn about", async () => {
    const { flow, calls } = setup(ws([term("t1", { restoreOnRestart: true, persistentCommand: "make" })]));
    await flow.request("w1");
    expect(calls).toContain("hibernate");
    expect(calls).not.toContain("pending:w1");
  });

  it("opens the dialog instead when a command would be lost", async () => {
    const { flow, calls } = setup(ws([term("t1")]), {
      live: () => ({ agentOf: () => undefined, runningCommand: () => "npm run dev" }),
    });
    await flow.request("w1");
    expect(calls).toContain("pending:w1");
    expect(calls).not.toContain("hibernate");
  });

  it("flushes autosave and lets the state settle before reviewing", async () => {
    const { flow, calls } = setup(ws([term("t1")]), { autosaveEnabled: () => true });
    await flow.request("w1");
    expect(calls.indexOf("flush")).toBeLessThan(calls.indexOf("settle"));
    expect(calls.indexOf("settle")).toBeLessThan(calls.indexOf("hibernate"));
  });

  it("marks tabs, finishes each agent session and closes floats before flagging", async () => {
    const { flow, calls } = setup(ws([term("t1"), term("t2")]));
    await flow.perform("w1");
    expect(isHibernating("t1") && isHibernating("t2")).toBe(true);
    expect(calls).toEqual(["pending:null", "finish:t1", "finish:t2", "floats", "hibernate"]);
  });

  it("hibernates once when performed twice at the same time", async () => {
    const { flow, calls } = setup(ws([term("t1")]));
    await Promise.all([flow.perform("w1"), flow.perform("w1")]);
    expect(calls.filter((c) => c === "hibernate")).toHaveLength(1);
  });

  it("ignores a workspace that is already hibernated", async () => {
    const { flow, calls } = setup(ws([term("t1")], { hibernated: true }));
    await flow.request("w1");
    await flow.perform("w1");
    expect(calls).toEqual([]);
  });
});
```

Run: `pnpm test src/modules/workspaces/lib/useHibernateFlow.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar `useHibernateFlow.ts`**

```ts
import { useCallback, useMemo, useRef, useState } from "react";
import { markHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { terminalTabs } from "./hibernate";
import { hibernateReview, isReviewEmpty, type HibernateLive } from "./hibernateReview";
import { getRunningCommandsSnapshot } from "./terminalEphemeralStore";
import type { Workspace } from "./types";

export type HibernateFlowDeps = {
  getWorkspace: (workspaceId: string) => Workspace | undefined;
  autosaveEnabled: () => boolean;
  flushDirtyEditors: () => Promise<void>;
  // Lets the dirty flags written by the flush reach the workspace state.
  settle: () => Promise<void>;
  live: () => HibernateLive;
  finishAgent: (tabId: string) => void;
  destroyFloats: (workspaceId: string) => Promise<void>;
  hibernate: (workspaceId: string) => void;
  setPending: (workspaceId: string | null) => void;
};

export function createHibernateFlow(d: HibernateFlowDeps) {
  const inFlight = new Set<string>();

  async function perform(workspaceId: string): Promise<void> {
    const ws = d.getWorkspace(workspaceId);
    if (!ws || ws.hibernated || inFlight.has(workspaceId)) return;
    inFlight.add(workspaceId);
    try {
      // First, so the dialog stops watching the stores this call is about to change.
      d.setPending(null);
      const ids = terminalTabs(ws).map((t) => t.id);
      markHibernating(ids);
      for (const id of ids) d.finishAgent(id);
      await d.destroyFloats(workspaceId);
      d.hibernate(workspaceId);
    } finally {
      inFlight.delete(workspaceId);
    }
  }

  async function request(workspaceId: string): Promise<void> {
    if (d.getWorkspace(workspaceId)?.hibernated) return;
    if (d.autosaveEnabled()) {
      await d.flushDirtyEditors();
      await d.settle();
    }
    const ws = d.getWorkspace(workspaceId);
    if (!ws || ws.hibernated) return;
    if (isReviewEmpty(hibernateReview(ws, d.live()))) {
      await perform(workspaceId);
      return;
    }
    d.setPending(workspaceId);
  }

  return { request, perform };
}

const nextFrames = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

type HookDeps = {
  workspacesRef: { current: Workspace[] };
  hibernateWorkspace: (workspaceId: string) => void;
  flushDirtyEditors: () => Promise<void>;
  destroyWorkspaceFloats: (workspaceId: string, workspaces: Workspace[]) => Promise<void>;
};

export function useHibernateFlow(deps: HookDeps) {
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const flow = useMemo(
    () =>
      createHibernateFlow({
        getWorkspace: (id) => depsRef.current.workspacesRef.current.find((w) => w.id === id),
        autosaveEnabled: () => usePreferencesStore.getState().editorAutoSave,
        flushDirtyEditors: () => depsRef.current.flushDirtyEditors(),
        settle: nextFrames,
        live: () => {
          const sessions = useAgentStore.getState().sessions;
          const commands = getRunningCommandsSnapshot();
          return { agentOf: (id) => sessions[id], runningCommand: (id) => commands.get(id) };
        },
        finishAgent: (id) => useAgentStore.getState().finish(id),
        destroyFloats: (id) => depsRef.current.destroyWorkspaceFloats(id, depsRef.current.workspacesRef.current),
        hibernate: (id) => depsRef.current.hibernateWorkspace(id),
        setPending: setPendingWorkspaceId,
      }),
    [],
  );

  const cancel = useCallback(() => setPendingWorkspaceId(null), []);

  return {
    pendingWorkspaceId,
    requestHibernate: flow.request,
    performHibernate: flow.perform,
    cancel,
  };
}
```

Run: `pnpm test src/modules/workspaces/lib/useHibernateFlow.test.ts`. Expected: PASS. (Si Vitest no tiene `requestAnimationFrame` en el entorno, `nextFrames` solo se usa dentro del hook; la fabrica recibe `settle` inyectado.)

- [ ] **Step 4: `HibernateDialog.tsx`**

Modal con `AlertDialog` de shadcn (patron de `CloseDialogs.tsx`):

```tsx
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { pathBasename } from "@/lib/pathUtils";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  getRunningCommandsSnapshot,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { hibernateReview, isReviewEmpty } from "@/modules/workspaces/lib/hibernateReview";
import type { Workspace } from "@/modules/workspaces/lib/types";

type Props = {
  workspace: Workspace | null;
  onClose: () => void;
  onHibernate: () => void;
  onSaveTab: (tabId: string) => Promise<void>;
  onSaveAll: (tabIds: string[]) => Promise<void>;
  onEnableRunOnStart: (tabId: string, runningCommand?: string) => void;
};

export function HibernateDialog({ workspace, onClose, onHibernate, onSaveTab, onSaveAll, onEnableRunOnStart }: Props) {
  const sessions = useAgentStore((s) => s.sessions);
  const commands = useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot);
  const review = useMemo(
    () =>
      workspace
        ? hibernateReview(workspace, {
            agentOf: (id) => sessions[id],
            runningCommand: (id) => commands.get(id),
          })
        : null,
    [workspace, sessions, commands],
  );

  // The dialog only opens when something is pending: once everything is
  // resolved there is nothing left to warn about, so it closes and hibernates.
  useEffect(() => {
    if (workspace && review && isReviewEmpty(review)) onHibernate();
  }, [workspace, review, onHibernate]);

  return (
    <AlertDialog open={workspace !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hibernate this workspace?</AlertDialogTitle>
          <AlertDialogDescription>
            Hibernating closes every terminal and editor. The items below cannot be recovered when you restore it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {review && review.agents.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Agents working</h3>
            {review.agents.map((a) => (
              <p key={a.tabId} className="text-[12px] text-muted-foreground">
                {a.title ?? a.agent} is still working
              </p>
            ))}
          </section>
        )}
        {review && review.docs.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Unsaved documents</h3>
            {review.docs.map((d) => (
              <div key={d.tabId} className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-muted-foreground" title={d.path}>
                  {pathBasename(d.path)}
                </span>
                <Button size="sm" variant="outline" title="Save this document" onClick={() => void onSaveTab(d.tabId)}>
                  Save
                </Button>
              </div>
            ))}
            <Button size="sm" title="Save every unsaved document" onClick={() => void onSaveAll(review.docs.map((d) => d.tabId))}>
              Save all
            </Button>
          </section>
        )}
        {review && review.commands.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Commands that will not come back</h3>
            {review.commands.map((c) => (
              <div key={c.tabId} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[12px] text-muted-foreground" title={c.command}>
                  {c.command}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  title="Run this command again when the workspace is restored"
                  onClick={() => onEnableRunOnStart(c.tabId, commands.get(c.tabId))}
                >
                  Run on start
                </Button>
              </div>
            ))}
          </section>
        )}
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onHibernate} autoFocus>
            Hibernate anyway
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Los botones de fila son `Button` normales de shadcn con `title` nativo (no `AlertDialogAction`), para que no cierren el modal.

- [ ] **Step 5: Wiring en `App.tsx`**

- Obtener `hibernateWorkspace` y `wakeWorkspace` de `useWorkspaces()`.
- Instanciar `const hibernateFlow = useHibernateFlow({ workspacesRef, hibernateWorkspace, flushDirtyEditors, destroyWorkspaceFloats });` despues de definir `flushDirtyEditors` (~linea 1900).
- Mapa de atajos (~linea 2636, junto a `"workspace.run"`): `"workspace.hibernate": () => { if (activeWorkspace) void hibernateFlow.requestHibernate(activeWorkspace.id); },`. En el array de dependencias del `useMemo` de `shortcutHandlers` (~linea 2884) anadir `hibernateFlow.requestHibernate` (estable), no el objeto `hibernateFlow`.
- Renderizar junto a `<CloseDialogs>` (~linea 3473):

```tsx
<HibernateDialog
  workspace={workspaces.find((w) => w.id === hibernateFlow.pendingWorkspaceId) ?? null}
  onClose={hibernateFlow.cancel}
  onHibernate={handleHibernateFromDialog}
  onSaveTab={async (tabId) => { await saveTab(tabId); }}
  onSaveAll={async (tabIds) => { await Promise.all(tabIds.map((id) => saveTab(id).catch(() => {}))); }}
  onEnableRunOnStart={(tabId, running) => {
    const id = hibernateFlow.pendingWorkspaceId;
    if (id) updateTabData(id, tabId, (t) => enableRunOnStart(t, running));
  }}
/>
```

con `handleHibernateFromDialog` en un `useCallback` que lee `hibernateFlow.pendingWorkspaceId` desde un ref, de modo que su identidad sea estable y el efecto del modal no se redispare en cada render.

- [ ] **Step 6: Documentar en este mismo commit**

- `docs/WORKSPACES.md`: flujo de hibernar y despertar, el modal reactivo y sus tres listas.
- `docs/FORK.md`: funcionalidad nueva que el upstream no tiene.
- `CLAUDE.md`: fila **Workspace hibernado** en el glosario (que es, donde vive, "Como te refieres a ello": "dormido", "suspendido", "zzz", "hibernar").

- [ ] **Step 7: Comprobaciones**

Run: `pnpm test && pnpm check-types && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Verificacion manual (checklist)**

Con `pnpm tauri dev` en el worktree:
1. Workspace con un shell vacio: Cmd+Alt+Z hiberna sin modal; Restore devuelve el shell en el mismo sitio.
2. Terminal con `sleep 600` sin Run on start: sale el modal con el comando; Run on start quita la fila, el modal se cierra solo y hiberna; Restore reescribe `sleep 600`.
3. Documento editado con autosave desactivado: sale en el modal; Save lo quita; Save all quita todos; Close no hiberna; Hibernate anyway descarta; al despertar no recupera el texto no guardado. Con autosave activado: no sale en el modal y queda guardado.
4. Agente con spinner: sale en el modal y desaparece cuando termina el turno; el modal se cierra y hiberna si no queda nada.
5. Agente en reposo con Run on start: no avisa; al despertar se reanuda (`claude --resume`) y su registro sigue en `user-data/support-dev/agent-sessions.json`.
6. Terminal de script lanzado desde el RunButton: no avisa; tras despertar, pulsar Run lo relanza.
7. Navegador flotante en el workspace: la ventana se cierra al hibernar y no reaparece al reiniciar Kex.
8. Reiniciar Kex con un workspace hibernado: sigue hibernado, no hay PTY, y despierta bien.
9. Con el workspace hibernado activo: Cmd+T, Cmd+W y F12 no hacen nada; Cmd+Alt+Z de nuevo no rompe nada.

- [ ] **Step 9: Commit**

```bash
git add -A src docs CLAUDE.md
git commit -m "Add hibernate flow, review dialog and Cmd+Alt+Z shortcut"
```

---

### Task 5: Verificacion final

- [ ] **Step 1: Todo en verde**

Run: `pnpm lint && pnpm check-types && pnpm test && cd src-tauri && cargo clippy && cargo test --locked`
Expected: todo en verde, sin avisos nuevos.

- [ ] **Step 2: Comprobar que no quedan em-dash ni emojis en lo anadido**

Run: `git diff main...HEAD | grep -nP "\x{2014}|\p{Extended_Pictographic}"`
Expected: sin resultados.


## Self-Review (plan contra spec)

- Modelo, persistencia, defecto falso, sin compatibilidad: Task 1 Step 1.
- Render sin tabs mas capa y Restore, WorkspaceBar vacia: Task 3.
- Atajo reasignable: Task 4 Step 1.
- Modal con tres listas, Save/Save all, Run on start, Close, Hibernate anyway, vivo y autocierre, "solo comandos" espera: Task 1 (logica) y Task 4 (UI).
- Autosave guarda antes: Task 4 `requestHibernate`.
- Hibernar mata siempre, flotantes, orden: Task 4 `performHibernate`.
- Despertar: planes, buffers descartados, desmarcado: Task 3 Step 4.
- Proteccion del registro y supervivencia a reinicio: Task 2.
- Scripts del RunButton: Task 1 (`hibernateReview`).
- Documentacion y glosario: repartidos en los commits de las Tasks 2, 3 y 4; Task 5 solo verifica.
- Floats, atajos bloqueados, notificaciones y lista anidada de hibernados: Tasks 1 y 3.
- Consistencia de nombres: `hibernateWorkspace`, `wakeWorkspace`, `applyHibernate`, `applyWake`, `stripTabs`, `terminalTabs`, `editorTabIds`, `enableRunOnStart`, `hibernateReview`, `isReviewEmpty`, `markHibernating`, `unmarkHibernating`, `isHibernating`, `detachesRecord`, `discardUnflushedBuffers`, `planWake` coinciden entre tareas.
