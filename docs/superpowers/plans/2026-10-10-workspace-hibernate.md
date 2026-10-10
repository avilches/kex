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
- Documentacion viva en el mismo commit que el cambio de codigo (Task 5 la concentra, pero cada tarea que cambie comportamiento visible la menciona en su commit si ya existe la seccion).

## Review Focus

1. Matar un PTY con un agente armado no debe borrar su registro en `agent-sessions.json`. Test: `detachesRecord("exited", true) === false` y `true` para una tab normal. Mas el test Rust de supervivencia.
2. Un documento con autosave desactivado deja su buffer en `unflushedBuffers` al desmontarse; al despertar no debe resucitar. Test de `discardUnflushedBuffers`.
3. Una sesion de agente que muere sin que su senal llegue (el PTY se descarta antes) no debe dejar un spinner fantasma en la WorkspaceBar. Test: hibernar llama a `finish` para cada terminal.
4. Un agente con spinner que ademas no tiene Run on start no debe salir duplicado en dos listas del modal. Test en `hibernateReview`.
5. Una terminal de script del RunButton con comando en marcha no debe avisar ni ofrecer Run on start. Test en `hibernateReview`.

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
| `src/modules/editor/lib/useDocument.ts` | Modificar | `discardUnflushedBuffers(tabIds)` exportado |
| `src/modules/workspaces/WorkspaceView.tsx` | Modificar | Arbol sin tabs + `HibernatedOverlay` |
| `src/modules/workspaces/HibernatedOverlay.tsx` | Crear | Capa Zzzzz con boton Restore |
| `src/modules/workspaces/SplitNodeView.tsx` | Modificar | Propagar `hibernated` a `PaneView` |
| `src/modules/workspaces/PaneView.tsx` | Modificar | Render vacio si `hibernated` |
| `src/app/App.tsx` | Modificar | Barrido de sesiones, atajo, wiring del flujo y del modal |
| `src/app/components/WorkspaceBar.tsx` | Modificar | Lista anidada vacia para hibernados |
| `src/app/components/HibernateDialog.tsx` | Crear | Modal reactivo reutilizable |
| `src/modules/workspaces/lib/useHibernateFlow.ts` | Crear | Orquestacion: pedir, revisar, hibernar |
| `src/modules/shortcuts/shortcuts.ts` | Modificar | Atajo `workspace.hibernate` |
| `docs/ARCHITECTURE.md`, `docs/WORKSPACES.md`, `docs/AGENT_SESSION_RESTORE.md`, `docs/FORK.md`, `CLAUDE.md` | Modificar | Documentacion y glosario |

---

### Task 1: Nucleo puro (modelo, transiciones, avisos)

**Files:**
- Modify: `src/modules/workspaces/lib/types.ts`
- Create: `src/modules/workspaces/lib/hibernate.ts`, `src/modules/workspaces/lib/hibernate.test.ts`
- Create: `src/modules/workspaces/lib/hibernateReview.ts`, `src/modules/workspaces/lib/hibernateReview.test.ts`

**Interfaces:**
- Produces (`hibernate.ts`):
  - `stripTabs(node: SplitNode): SplitNode`
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
  editorTabIds,
  enableRunOnStart,
  stripTabs,
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
import { allPanes } from "./splitNode";
import type { PaneNode, SplitNode, Tab, Workspace } from "./types";

type TerminalTab = Extract<Tab, { kind: "terminal" }>;

export function stripTabs(node: SplitNode): SplitNode {
  if (node.kind === "pane") return { ...node, tabs: [], activeTabId: null };
  return { ...node, first: stripTabs(node.first), second: stripTabs(node.second) };
}

function clearDirty(node: SplitNode): SplitNode {
  if (node.kind === "pane") {
    const pane: PaneNode = {
      ...node,
      tabs: node.tabs.map((t) =>
        t.kind === "editor" ? { ...t, dirty: false } : t.kind === "markdown" ? { ...t, dirty: false } : t,
      ),
    };
    return pane;
  }
  return { ...node, first: clearDirty(node.first), second: clearDirty(node.second) };
}

export function applyHibernate(workspaces: Workspace[], workspaceId: string): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId ? { ...w, hibernated: true, paneTree: clearDirty(w.paneTree) } : w,
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

  it("lists a terminal that has a persistent command but Run on start off", () => {
    const r = hibernateReview(ws([term("t1", { persistentCommand: "make watch" })]), live());
    expect(r.commands.map((c) => c.command)).toEqual(["make watch"]);
  });

  it("does not list a terminal with Run on start", () => {
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

// Agents default to restoring; plain terminals default to not (same rule as the
// "Run on start" checkbox in TerminalPathBarMenu).
function runsOnStart(tab: Extract<Tab, { kind: "terminal" }>, isAgent: boolean): boolean {
  return isAgent ? tab.restoreOnRestart !== false : (tab.restoreOnRestart ?? false);
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
    if (runsOnStart(tab, agent !== undefined)) continue;
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
        let ws = serde_json::json!([{
            "id": "ws-1",
            "hibernated": true,
            "paneTree": {"type": "leaf", "pane": {"id": "pane-1", "tabs": [{"id": "tab-a", "kind": "terminal"}]}}
        }]);
        mgr.update_workspace("w-main", ws, 0);

        assert_eq!(mgr.terminal_tab_ids(), HashSet::from(["tab-a".to_string()]));
    }
```

- [ ] **Step 5: Ejecutar todo**

Run: `pnpm test src/modules/agents && pnpm check-types && pnpm lint && cd src-tauri && cargo test --locked terminal_tab_ids && cargo clippy`
Expected: PASS. (El test Rust pasa desde el primer momento: es una regresion que fija un invariante existente.)

- [ ] **Step 6: Commit**

```bash
git add src/modules/agents src-tauri/src/modules/window_state.rs
git commit -m "Keep agent session records when a workspace hibernates"
```

---

### Task 3: Transicion en `useWorkspaces`, descarte de buffers y render

**Files:**
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts`, `src/modules/workspaces/lib/useWorkspaces.test.ts`
- Modify: `src/modules/editor/lib/useDocument.ts`
- Create: `src/modules/workspaces/HibernatedOverlay.tsx`
- Modify: `src/modules/workspaces/WorkspaceView.tsx`, `SplitNodeView.tsx`, `PaneView.tsx`
- Modify: `src/app/App.tsx` (barrido de sesiones, ~linea 640-675), `src/app/components/WorkspaceBar.tsx`

**Interfaces:**
- Consumes (Task 1): `applyHibernate`, `applyWake`, `stripTabs`, `terminalTabs`, `editorTabIds`. (Task 2): `unmarkHibernating`.
- Produces: `useWorkspaces()` devuelve ademas `hibernateWorkspace(workspaceId: string): void` y `wakeWorkspace(workspaceId: string): Promise<void>`. `useDocument.ts` exporta `discardUnflushedBuffers(tabIds: Iterable<string>): void`. `WorkspaceView` recibe la prop nueva `onWake: (workspaceId: string) => void`.

- [ ] **Step 1: Test de `discardUnflushedBuffers` (falla)**

Mirar como `useDocument.ts` ya se prueba (si hay `useDocument.test.ts`, anadir ahi; si no, crear `src/modules/editor/lib/unflushedBuffers.test.ts`). Para poder testearlo sin montar el hook, exportar tambien `hasUnflushedBuffer(tabId): boolean` y `stashUnflushedBuffer(tabId, text): void` desde `useDocument.ts` (el efecto de desmontaje pasa a usar `stashUnflushedBuffer`). Test:

```ts
import { describe, expect, it } from "vitest";
import { discardUnflushedBuffers, hasUnflushedBuffer, stashUnflushedBuffer } from "./useDocument";

describe("discardUnflushedBuffers", () => {
  it("drops the carried edits of the given tabs only", () => {
    stashUnflushedBuffer("t1", "a");
    stashUnflushedBuffer("t2", "b");
    discardUnflushedBuffers(["t1"]);
    expect(hasUnflushedBuffer("t1")).toBe(false);
    expect(hasUnflushedBuffer("t2")).toBe(true);
    discardUnflushedBuffers(["t2"]);
  });
});
```

Run: `pnpm test src/modules/editor/lib` Expected: FAIL.

- [ ] **Step 2: Implementar en `useDocument.ts`**

Junto a `const unflushedBuffers = new Map<string, string>();` (linea 24):

```ts
export function stashUnflushedBuffer(tabId: string, text: string): void {
  unflushedBuffers.set(tabId, text);
}

export function hasUnflushedBuffer(tabId: string): boolean {
  return unflushedBuffers.has(tabId);
}

export function discardUnflushedBuffers(tabIds: Iterable<string>): void {
  for (const id of tabIds) unflushedBuffers.delete(id);
}
```

y en el efecto de desmontaje (linea ~294) reemplazar `unflushedBuffers.set(tabId, bufferRef.current);` por `stashUnflushedBuffer(tabId, bufferRef.current);`. Run del test: PASS.

- [ ] **Step 3: Tests de la transicion en `useWorkspaces.test.ts` (fallan)**

El archivo prueba funciones `apply*` exportadas. Anadir una funcion pura exportada `planWake(ws: Workspace): string[]` en `useWorkspaces.ts` que devuelva los ids de las terminales para las que hay que pedir plan de resume (`needsResumePlanLookup`), y probarla:

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
```

(importar `planWake` en la linea de imports del archivo). Run: FAIL.

- [ ] **Step 4: Implementar en `useWorkspaces.ts`**

Imports nuevos al principio: `import { applyHibernate, applyWake, editorTabIds, terminalTabs } from "./hibernate";`, `import { unmarkHibernating } from "@/modules/agents/lib/hibernatingTabs";`, `import { discardUnflushedBuffers } from "@/modules/editor/lib/useDocument";`.

Junto a `needsResumePlanLookup`:

```ts
export function planWake(ws: Workspace): string[] {
  return terminalTabs(ws).filter(needsResumePlanLookup).map((t) => t.id);
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
    await Promise.all(
      planWake(ws).map(async (tabId) => {
        const plan = await previewResumeCmd(tabId);
        if (plan) seedRestorePlan(tabId, plan);
      }),
    );
    discardUnflushedBuffers(editorTabIds(ws));
    unmarkHibernating(terminalTabs(ws).map((t) => t.id));
    setWorkspaces((prev) => applyWake(prev, workspaceId));
  }, []);
```

y anadir `hibernateWorkspace, wakeWorkspace` al objeto devuelto.

- [ ] **Step 5: Capa `HibernatedOverlay.tsx`**

```tsx
import { Button } from "@/components/ui/button";

type Props = { onWake: () => void };

export function HibernatedOverlay({ onWake }: Props) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/95 text-muted-foreground">
      <span className="select-none text-5xl font-light tracking-widest">Zzzzz</span>
      <Button variant="outline" size="sm" onClick={onWake} autoFocus>
        Restore
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Render en `WorkspaceView.tsx`, `SplitNodeView.tsx`, `PaneView.tsx`**

`WorkspaceView.tsx`: importar `stripTabs` y `HibernatedOverlay`; anadir a `Props` `onWake: (workspaceId: string) => void;` y desestructurarlo (`onWake`) para que no se propague en `...rest`. En el `map` de workspaces, pasar `node={ws.hibernated ? stripTabs(ws.paneTree) : ws.paneTree}` y `hibernated={ws.hibernated}`, y tras `</SplitNodeView>` dentro del `div` del workspace: `{ws.hibernated && <HibernatedOverlay onWake={() => onWake(ws.id)} />}`.

`SplitNodeView.tsx`: anadir `hibernated?: boolean` a `Props`; pasar `hibernated={rest.hibernated}` a `<PaneView>` (los hijos recursivos ya reciben `{...rest}`).

`PaneView.tsx`: anadir `hibernated?: boolean` a `Props`; al principio del componente, tras los hooks, `if (hibernated) return <div className="h-full w-full border border-border" />;`. Respetar el orden de hooks: el `return` temprano debe ir despues de TODOS los hooks del componente (mirar el final de los hooks y colocarlo justo antes del JSX principal).

- [ ] **Step 7: Barrido de sesiones en `App.tsx` (~linea 640-675)**

En el efecto "Live terminal tab tracking", al construir `live`, saltar los workspaces hibernados para que sus terminales se destruyan por el camino normal:

```ts
    for (const ws of workspaces) {
      if (ws.hibernated) continue;
```

Dos efectos colaterales que este cambio tiene que cubrir en el mismo sitio:
- Al destruirse una terminal, `finish` del almacen de agentes no se ejecuta (la senal llega con la sesion ya descartada). Dentro del `if (!live.has(id))`, antes de `disposeSession(id)`, anadir `useAgentStore.getState().finish(id);` para no dejar spinners fantasma (Review Focus 3).
- Pasar `onWake` a `<WorkspaceView>`: `onWake={(id) => void wakeWorkspace(id)}` y obtener `wakeWorkspace`/`hibernateWorkspace` del `useWorkspaces()` ya destructurado en App.tsx.

- [ ] **Step 8: Lista anidada de la WorkspaceBar**

En `WorkspaceBar.tsx`, donde se construye el detalle de tabs de cada workspace (buscar el uso de `workspaceDetail`, ~linea 857), si `ws.hibernated` no generar filas (lista vacia). Mantener el workspace en la barra.

- [ ] **Step 9: Tests y comprobaciones**

Run: `pnpm test && pnpm check-types && pnpm lint`
Expected: PASS.

- [ ] **Step 10: Verificacion manual del render**

Run `pnpm tauri dev` desde el worktree. En un workspace de prueba, editar `src-tauri`-persistido no hace falta: anadir temporalmente (sin commitear) `hibernated: true` a un workspace via `user-data/support-dev/workspaces/<id>.json` con la app cerrada, arrancar y comprobar: panes y divisores visibles, ninguna tab, capa Zzzzz, boton Restore despierta y las tabs vuelven. Ningun PTY de ese workspace debe existir (`ps` por `KEX_TAB_ID` o el log `Kex.log` de `user-data/logs-dev`).

- [ ] **Step 11: Commit**

```bash
git add -A src
git commit -m "Render hibernated workspaces and wake them from the overlay"
```

---

### Task 4: Flujo de hibernar, modal y atajo

**Files:**
- Create: `src/modules/workspaces/lib/useHibernateFlow.ts`
- Create: `src/app/components/HibernateDialog.tsx`
- Modify: `src/modules/shortcuts/shortcuts.ts` (+ su test si lista ids)
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes (Task 1-3): `hibernateReview`, `isReviewEmpty`, `enableRunOnStart`, `terminalTabs`, `hibernateWorkspace`, `markHibernating`, `useAgentStore`, `getRunningCommandsSnapshot`, `subscribeToRunningCommands`.
- Produces: `useHibernateFlow(deps)` devuelve `{ pendingWorkspaceId: string | null; requestHibernate(wsId: string): Promise<void>; performHibernate(wsId: string): Promise<void>; cancel(): void }`. `HibernateDialog` props: `{ workspace: Workspace | null; onClose(): void; onHibernate(): void; onSaveTab(tabId: string): Promise<void>; onSaveAll(tabIds: string[]): Promise<void>; onEnableRunOnStart(tabId: string, runningCommand?: string): void }`.

- [ ] **Step 1: Atajo**

En `shortcuts.ts`: anadir `| "workspace.hibernate"` al union `ShortcutId` (junto a `workspace.run`) y la entrada del registry:

```ts
  {
    id: "workspace.hibernate",
    label: "Hibernate Workspace",
    group: "General",
    defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "z" }],
  },
```

Comprobar que ningun otro atajo usa Mod+Alt+Z (`shortcuts.test.ts` ya valida conflictos; ejecutarlo) y que en macOS la tecla con Alt sigue resolviendo a `z` (mirar como `matchBinding` trata `alt+b`, `alt+h`, `alt+n` ya existentes y seguir el mismo patron). Run: `pnpm test src/modules/shortcuts`. Expected: PASS.

- [ ] **Step 2: `useHibernateFlow.ts`**

```ts
import { useCallback, useRef, useState } from "react";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { markHibernating } from "@/modules/agents/lib/hibernatingTabs";
import { getRunningCommandsSnapshot } from "./terminalEphemeralStore";
import { hibernateReview, isReviewEmpty } from "./hibernateReview";
import { terminalTabs } from "./hibernate";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Workspace } from "./types";

type Deps = {
  workspacesRef: { current: Workspace[] };
  hibernateWorkspace: (workspaceId: string) => void;
  flushDirtyEditors: () => Promise<void>;
  destroyWorkspaceFloats: (workspaceId: string, workspaces: Workspace[]) => Promise<void>;
};

export function useHibernateFlow(deps: Deps) {
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const performHibernate = useCallback(async (workspaceId: string) => {
    const d = depsRef.current;
    const ws = d.workspacesRef.current.find((w) => w.id === workspaceId);
    if (!ws || ws.hibernated) return;
    const ids = terminalTabs(ws).map((t) => t.id);
    markHibernating(ids);
    for (const id of ids) useAgentStore.getState().finish(id);
    await d.destroyWorkspaceFloats(workspaceId, d.workspacesRef.current);
    d.hibernateWorkspace(workspaceId);
    setPendingWorkspaceId(null);
  }, []);

  const requestHibernate = useCallback(
    async (workspaceId: string) => {
      const d = depsRef.current;
      const ws = d.workspacesRef.current.find((w) => w.id === workspaceId);
      if (!ws || ws.hibernated) return;
      if (usePreferencesStore.getState().editorAutoSave) await d.flushDirtyEditors();
      const fresh = d.workspacesRef.current.find((w) => w.id === workspaceId);
      if (!fresh) return;
      const sessions = useAgentStore.getState().sessions;
      const commands = getRunningCommandsSnapshot();
      const review = hibernateReview(fresh, {
        agentOf: (id) => sessions[id],
        runningCommand: (id) => commands.get(id),
      });
      if (isReviewEmpty(review)) {
        await performHibernate(workspaceId);
        return;
      }
      setPendingWorkspaceId(workspaceId);
    },
    [performHibernate],
  );

  const cancel = useCallback(() => setPendingWorkspaceId(null), []);

  return { pendingWorkspaceId, requestHibernate, performHibernate, cancel };
}
```

Nota para quien implemente: `flushDirtyEditors` guarda a traves de los handles; tras guardar, el `dirty` de la tab se actualiza de forma asincrona en el estado. Por eso `requestHibernate` relee `workspacesRef.current` DESPUES del flush. Si en la prueba manual aun aparece algun documento ya guardado, esperar un tick (`await new Promise((r) => setTimeout(r, 0))`) tras el flush.

- [ ] **Step 3: `HibernateDialog.tsx`**

Modal con `AlertDialog` de shadcn (patron de `CloseDialogs.tsx`). Comportamiento exacto:

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

  // The modal was opened because something was pending: once everything is
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
            Hibernating closes every terminal and editor. These cannot be recovered when you restore it.
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
                <Button size="sm" variant="outline" onClick={() => void onSaveTab(d.tabId)}>
                  Save
                </Button>
              </div>
            ))}
            <Button size="sm" onClick={() => void onSaveAll(review.docs.map((d) => d.tabId))}>
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
                <Button size="sm" variant="outline" onClick={() => onEnableRunOnStart(c.tabId, commands.get(c.tabId))}>
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

Detalles a respetar: botones de acciones pequenas y titles nativos segun el patron de `ShortcutsSection`; si `AlertDialog` cierra al pulsar un `Button` normal, comprobar que los botones de fila NO cierran el modal (usar `Button` y no `AlertDialogAction`).

- [ ] **Step 4: Wiring en `App.tsx`**

- Obtener `hibernateWorkspace` y `wakeWorkspace` de `useWorkspaces()`.
- Instanciar `const hibernateFlow = useHibernateFlow({ workspacesRef, hibernateWorkspace, flushDirtyEditors, destroyWorkspaceFloats });` despues de definir `flushDirtyEditors` (~linea 1900) y `destroyWorkspaceFloats` (ya disponible).
- Mapa de atajos (~linea 2636, junto a `"workspace.run"`): `"workspace.hibernate": () => { if (activeWorkspace) void hibernateFlow.requestHibernate(activeWorkspace.id); },`.
- Renderizar, junto a `<CloseDialogs>` (~linea 3473):

```tsx
<HibernateDialog
  workspace={workspaces.find((w) => w.id === hibernateFlow.pendingWorkspaceId) ?? null}
  onClose={hibernateFlow.cancel}
  onHibernate={() => hibernateFlow.pendingWorkspaceId && void hibernateFlow.performHibernate(hibernateFlow.pendingWorkspaceId)}
  onSaveTab={async (tabId) => { await saveTab(tabId); }}
  onSaveAll={async (tabIds) => { await Promise.all(tabIds.map((id) => saveTab(id).catch(() => {}))); }}
  onEnableRunOnStart={(tabId, running) => {
    const ws = workspaces.find((w) => w.id === hibernateFlow.pendingWorkspaceId);
    if (ws) updateTabData(ws.id, tabId, (t) => enableRunOnStart(t, running));
  }}
/>
```

`onHibernate` se pasa estable: envolverlo en `useCallback` para que el efecto del modal no se redispare en cada render.

- [ ] **Step 5: Comprobaciones**

Run: `pnpm test && pnpm check-types && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Verificacion manual (checklist)**

Con `pnpm tauri dev` en el worktree:
1. Workspace con un shell vacio: Cmd+Alt+Z hiberna sin modal; Restore devuelve el shell en el mismo sitio.
2. Un terminal con `sleep 600` sin Run on start: sale el modal con el comando y el boton Run on start; activarlo quita la fila, el modal se cierra solo y hiberna; Restore reescribe `sleep 600`.
3. Un documento editado con autosave desactivado: sale en el modal; Save lo quita; Save all quita todos; cerrar el modal con Close no hiberna; Hibernate anyway descarta; al despertar el documento no recupera el texto no guardado.
4. Un agente trabajando (spinner): sale en el modal y desaparece cuando termina el turno; el modal se cierra y hiberna si no queda nada.
5. Un agente en reposo con Run on start: no avisa; al despertar se reanuda (`claude --resume`).
6. Terminal de script lanzado desde el RunButton: no avisa; tras despertar, pulsar Run lo relanza.
7. Reiniciar Kex con un workspace hibernado: sigue hibernado y despierta bien.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "Add hibernate flow, review dialog and Cmd+Alt+Z shortcut"
```

---

### Task 5: Documentacion, glosario y cierre

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `docs/WORKSPACES.md`, `docs/AGENT_SESSION_RESTORE.md`, `docs/FORK.md`, `CLAUDE.md` (glosario)

- [ ] **Step 1: Documentar**

- `docs/ARCHITECTURE.md`: modelo (`Workspace.hibernated`), por que las tabs permanecen en el JSON, y la limitacion: scripts del RunButton no se relanzan solos.
- `docs/WORKSPACES.md`: render del workspace hibernado (`stripTabs`, `HibernatedOverlay`, exclusion en el barrido de sesiones) y el flujo de hibernar/despertar.
- `docs/AGENT_SESSION_RESTORE.md`: `hibernatingTabs`, `detachesRecord` y que despertar usa `previewResumeCmd` + `seedRestorePlan`; la dependencia de orden entre `disposeSession` y la senal `exited`.
- `docs/FORK.md`: funcionalidad nueva no presente en el upstream.
- `CLAUDE.md`: fila **Workspace hibernado** en el glosario (que es, donde vive, alias "dormido", "suspendido", "zzz").

- [ ] **Step 2: Verificacion completa**

Run: `pnpm lint && pnpm check-types && pnpm test && cd src-tauri && cargo clippy && cargo test --locked`
Expected: todo en verde.

- [ ] **Step 3: Commit**

```bash
git add docs CLAUDE.md
git commit -m "Document hibernated workspaces"
```

---

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
- Docs y glosario: Task 5.
- Consistencia de nombres: `hibernateWorkspace`, `wakeWorkspace`, `applyHibernate`, `applyWake`, `stripTabs`, `terminalTabs`, `editorTabIds`, `enableRunOnStart`, `hibernateReview`, `isReviewEmpty`, `markHibernating`, `unmarkHibernating`, `isHibernating`, `detachesRecord`, `discardUnflushedBuffers`, `planWake` coinciden entre tareas.
