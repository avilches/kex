# Header/tab: mostrar el mensaje en vivo del agente

Fecha: 2026-06-30

## Objetivo

En el header (`WorkspaceTitle.tsx`), cuando el tab activo tiene un agente corriendo,
el subtitulo solo muestra el nombre del comando en ejecucion ("claude") en vez del
estado/mensaje real que el agente esta comunicando via el titulo de terminal (OSC).
El tab en `PaneTabBar.tsx` si lo muestra bien porque ya tenia una logica de
prioridad distinta a la del header. Ademas, el campo `agentSession.meta.sessionTitle`
(que llega una unica vez al arrancar la sesion, via el hook `SessionStart` de Claude
Code) no se usa en ningun sitio hoy.

Se busca: unificar en un unico hook reusable la logica de que titulo mostrar para un
tab con agente, usado tanto por el header como por la barra de tabs, incorporando
`sessionTitle` como relleno inicial antes de que llegue el primer titulo en vivo.

## Contexto (investigado antes de disenar)

- `WorkspaceTitle.tsx:46` calculaba el subtitulo con `tabTitle(tab, runningCommand, oscTitle)`.
  Para tabs terminal, `tabTitle()` prioriza `runningCommand` sobre `oscTitle`. Cuando
  hay un agente activo, el shell reporta via OSC 133 que el comando en ejecucion es
  literalmente `claude ...`, asi que `runningCommand` gana y el header muestra solo
  `"claude"`.
- `PaneTabBar.tsx:148-156` ya tenia su propia logica `agentTitle` (ahora extraida a
  `agentAwareTabTitle()` en un commit previo de esta misma sesion) que, cuando hay
  agente, salta `runningCommand` y usa `oscTitle` directamente. Por eso el tab si
  mostraba el mensaje correcto.
- `agentSession.meta.sessionTitle` (`AgentSessionMeta`, `src/modules/agents/lib/types.ts`)
  viene del JSON que Claude Code manda una sola vez en el hook `SessionStart`
  (`src-tauri/src/modules/pty/ipc.rs`). Frecuentemente vacio. No se actualiza en vivo.
  No se usa en ningun render actualmente.
- `oscTitle` es el titulo de ventana estandar (OSC 0/2) que Claude Code actualiza en
  vivo mientras trabaja. Vive en `oscTitleStore` (`src/modules/terminal/lib/oscTitleStore.ts`),
  un store externo con `useSyncExternalStore` (patron correcto para estado mutable de
  alta frecuencia, ya documentado en `CLAUDE.md`).
- Existe un bug aparte, no cubierto por este spec: `cleanOscTitle()` en `oscTitleStore.ts`
  no limpia glifos de status que son secuencias de 2 codepoints (simbolo + variation
  selector). Se deja fuera salvo que se confirme el simbolo exacto.

## Decisiones tomadas (brainstorming)

- **Fuente de `sessionTitle`**: `agentSession.meta.sessionTitle` (confirmado con el
  usuario, no `tab.title`/ai-title).
- **Prioridad cuando agente activo** (tab terminal):
  1. `tab.title` (rename manual explicito del tab, ya existia, se mantiene igual)
  2. `oscTitle` (en vivo, gana siempre que exista)
  3. `agentSession.meta.sessionTitle` (relleno inicial, solo mientras no ha llegado
     el primer `oscTitle`)
  4. `` `${agentName} · ${dirname}` `` (fallback final, sin cambios)
- **Arquitectura de datos**: NO se fusiona `oscTitle` dentro de `agentStore` (opcion
  B descartada). Los datos crudos se quedan donde ya viven (`oscTitleStore` para el
  titulo en vivo, `agentStore` para `sessionTitle`/sesion). Fusionarlos acoplaria el
  parser generico de OSC de terminal con el store de agentes y dispararia un
  `setState` de Zustand (con re-render de cualquier suscriptor de la sesion) en cada
  repintado de titulo del terminal, que puede ser varias veces por segundo.
  En su lugar, se centraliza solo la **logica de derivacion** en un hook unico.

## Arquitectura

Funcional puro (extension) + hook fino de composicion (shell delgado).

1. **`src/modules/workspaces/lib/tabTitle.tsx`** — extender la funcion pura existente
   `agentAwareTabTitle()`:
   ```ts
   export function agentAwareTabTitle(
     tab: Tab,
     hasAgent: boolean,
     agentName: string | undefined,
     oscTitle: string | undefined,
     sessionTitle: string | undefined,
     fallbackTitle: string,
   ): string {
     if (!hasAgent || tab.kind !== "terminal") return fallbackTitle;
     if (tab.title) return tab.title;
     if (oscTitle) return oscTitle;
     if (sessionTitle) return sessionTitle;
     const cwd = tab.cwd ?? "";
     const dirname = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
     return `${agentName} · ${dirname || fallbackTitle}`;
   }
   ```
   (Unico cambio de firma: nuevo parametro `sessionTitle` insertado entre `oscTitle`
   y `fallbackTitle`, con su rama de prioridad.)

2. **`src/modules/workspaces/lib/useAgentTabTitle.ts`** (nuevo, hook)
   Centraliza las 3 suscripciones (running command, osc title, agent store) y aplica
   `tabTitle()` + `agentAwareTabTitle()`. Firma:
   ```ts
   export type AgentTabTitleInfo = {
     displayTitle: string;
     isDescription: boolean;
     hasAgent: boolean;
     agentSession: AgentSession | undefined;
   };

   export function useAgentTabTitle(tab: Tab | null): AgentTabTitleInfo | null
   ```
   - `tab === null` -> `null`.
   - Internamente: `useSyncExternalStore` sobre `terminalEphemeralStore` (running
     command) y `oscTitleStore`; `useAgentStore((s) => s.sessions[tab.id])`.
   - `hasAgent = !!agentSession && tab.kind === "terminal"`.
   - `baseTitle = tabTitle(tab, runningCommand, oscTitle)`.
   - `displayTitle = agentAwareTabTitle(tab, hasAgent, agentSession?.agent, oscTitle, agentSession?.meta?.sessionTitle, baseTitle)`.
   - `isDescription = !!(tab.title || oscTitle || agentSession?.meta?.sessionTitle)`
     (antes solo miraba `tab.title || oscTitle`; se anade `sessionTitle` para que el
     truncado siga alineando a la izquierda cuando el texto mostrado es una
     descripcion, no una ruta).

3. **`src/modules/workspaces/PaneTabBar.tsx`**
   - Sustituye sus 3 suscripciones sueltas (`runningCommandMap`/`oscTitleMap`/
     `agentSession` via `useAgentStore`) y el calculo inline de `agentTitle`/
     `isDescription` por una unica llamada: `const info = useAgentTabTitle(tab);`.
   - **Se mantiene sin cambios** el calculo de `title` base
     (`tabTitle(tab, runningCommand, oscTitle)`) porque se usa aparte como
     `placeholder` del input de rename (linea 488) — no debe volverse agent-aware.
     Para esto, `PaneTabBar` sigue necesitando `runningCommand`/`oscTitle` en crudo
     solo para ese placeholder; se mantienen esas dos suscripciones puntuales
     ademas de llamar al hook (no hay forma de evitarlo sin cambiar el
     comportamiento del placeholder, que esta fuera de alcance).
   - `agentSession`, `hasAgent`, `isRestoreError` (via `info.agentSession?.restoreError`)
     pasan a leerse de `info` en vez de la suscripcion manual a `useAgentStore`.

4. **`src/modules/header/WorkspaceTitle.tsx`**
   - Sustituye el calculo de `subtitle` por `useAgentTabTitle(tab)?.displayTitle ?? null`.
   - `hasAgent`/`agentSession` (usados para el `AgentIcon`) pasan a leerse de la
     misma llamada al hook en vez de su propia suscripcion a `useAgentStore`.
   - Deja de necesitar las suscripciones manuales a `oscTitleStore` y
     `terminalEphemeralStore` (las absorbe el hook).

5. **Fuera de alcance / sin cambios**
   - `App.tsx:970` (`tabTitle(activeTab)`, titulo de la ventana OS) y
     `WorkspaceDndProvider.tsx:369` (`tabTitle(draggingItem.tab)`, preview de drag):
     siguen usando `tabTitle()` a secas, sin estado del agente. Es lo correcto: ni
     el titulo de la ventana del SO ni el preview de arrastre deben mostrar el
     estado en vivo del agente.
   - `cleanOscTitle()` (bug del simbolo de 2 codepoints): no se toca en este cambio.

## Casos borde

- Agente recien arrancado, sin `oscTitle` todavia y `sessionTitle` vacio: cae al
  fallback `${agentName} · ${dirname}` (comportamiento actual, sin cambios).
- Agente recien arrancado, `sessionTitle` no vacio, `oscTitle` aun no ha llegado: se
  muestra `sessionTitle` hasta que llegue el primer `oscTitle`, momento en que este
  ultimo toma el control (via `useSyncExternalStore`, reactivo).
- Tab con rename manual (`tab.title` seteado): sigue ganando siempre, igual que hoy.
- Tab sin agente: `hasAgent` es `false`, `agentAwareTabTitle` devuelve `fallbackTitle`
  (el `tabTitle()` normal), sin cambio de comportamiento.

## Plan de tests

- `src/modules/workspaces/lib/tabTitle.test.ts`: anadir casos para
  `agentAwareTabTitle()` cubriendo la nueva prioridad `sessionTitle`:
  - `oscTitle` presente gana sobre `sessionTitle` presente.
  - `sessionTitle` presente gana cuando no hay `oscTitle`.
  - Sin `oscTitle` ni `sessionTitle`, cae al fallback `agentName · dirname`.
  - `tab.title` (rename manual) sigue ganando sobre todo lo demas.
- El hook `useAgentTabTitle` no se testea unitariamente (no hay `renderHook`/
  testing-library en el proyecto); es un shell fino de composicion sobre funciones
  puras ya cubiertas por tests, consistente con el resto del codebase.

## Documentacion viva a actualizar

- Ninguna: no hay comando Tauri nuevo, ni cambio de modelo de datos persistido, ni
  modulo nuevo que documentar en `ARCHITECTURE.md`/`IPC.md`. Cambio interno de
  frontend dentro de modulos ya documentados.
