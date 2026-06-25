# Terminal info bar (TerminalPathBar)

Fecha: 2026-06-25
Rama: `terminal-bar`

## Objetivo

Anadir una barra de informacion a cada panel terminal, gemela en estilo de la
`EditorPathBar`, que muestre el directorio actual y metricas vivas del proceso:
PID, proceso en ejecucion, CPU% y RAM.

## Decisiones tomadas (brainstorming + visual companion)

- **Contenido**: cwd, proceso en ejecucion, CPU%, RAM, PID.
- **Posicion**: arriba del area del terminal, igual que `EditorPathBar` (alto `h-6`).
- **Layout**: cwd a la izquierda (truncado rtl, `~` para home, clic = revelar en el
  explorer). A la derecha (`ml-auto`), en este orden: `pid · proceso · CPU% · RAM`.
- **PID delante del proceso**.
- **Proceso en reposo**: cuando no hay comando corriendo, mostrar el nombre de la
  shell (p. ej. `zsh`) en gris suave como "proceso".
- **CPU% normalizado 0-100%** del total de la maquina (dividido por nucleos), nunca
  estilo `top` por nucleo.
- **Muestreo cada 5s, solo en terminales visibles del workspace activo** (a lo sumo
  una por pane). Si no hay ninguna terminal visible, no se invoca nada.
- **Sin dropdown `[...]`** (YAGNI: el terminal no tiene ajustes por extension).
- Barra **siempre visible** (como la del editor).
- **Medicion** via crate `sysinfo` con un `System` persistente en el estado de Tauri.

## Arquitectura

### Frontend

Funcional puro / shell delgado. Estado efimero fuera del arbol de workspaces.

1. **`src/modules/terminal/TerminalPathBar.tsx`** (componente, shell delgado)
   - Estilo identico al contenedor de `EditorPathBar`:
     `flex h-6 w-full shrink-0 items-center gap-2 border-b border-border/60 bg-background px-2 text-[11px]`.
   - Izquierda: reutiliza la logica de `editorPathDisplay(path, explorerRoot, home)`
     para el breadcrumb del cwd (truncado rtl, `~`). Clic = `onReveal`
     (enrutado a `onFocusOnExplorer`, como el editor).
   - Derecha (`ml-auto`): `pid · proceso · CPU% · RAM`, separadores `·` en color tenue.
     El componente lee internamente (patron `useOscTitle`) el running command de
     `terminalEphemeralStore` y las metricas de `terminalMetricsStore` por `panelId`.
     - proceso: el running command si lo hay; si no, el `shellName` que viene en las
       metricas, en gris suave.
     - pid / CPU / RAM: de las metricas. Mientras no llegue el primer muestreo (sin
       entrada en el store), mostrar `-`.
   - Props (solo lo estatico): `{ panelId, cwd, explorerRoot, home, onReveal }`.

2. **`src/modules/workspaces/lib/terminalMetricsStore.ts`** (store efimero)
   - Mismo patron que `terminalEphemeralStore.ts`: `Map<panelId, PanelMetrics>` con
     `useSyncExternalStore`, snapshot cacheado, `notify()` solo cuando cambia.
   - `PanelMetrics = { pid: number; cpuPercent: number; memBytes: number; shellName: string }`.
   - `setMetrics(panelId, m)`, `clearMetricsEntry(panelId)`, `useMetrics(panelId)`.
   - Limpieza de la entrada al cerrar el panel (junto a `clearRunningCommandEntry`).

3. **`src/modules/terminal/lib/visibleTerminals.ts`** (funcional puro, testeable)
   - `visibleTerminalPanels(paneTree: SplitNode): { panelId: string }[]`: por cada
     pane (`allPanes`), el `activePanelId` si su panel es `kind === "terminal"`.

4. **`src/modules/terminal/lib/metricsFormat.ts`** (funcional puro, testeable)
   - `formatCpu(percent: number): string` -> `"18.7%"` (1 decimal, clamp 0-100).
   - `formatMem(bytes: number): string` -> `"340 MB"` / `"1.2 GB"` (umbral binario).

5. **`src/modules/terminal/lib/useTerminalMetricsSampler.ts`** (hook, una sola
   instancia, montado en `App` o `WorkspaceView`)
   - Cada 5s (no muestrea si el documento esta oculto / no hay terminales visibles):
     1. `visibleTerminalPanels(activeWorkspace.paneTree)`.
     2. mapea `panelId -> ptyId` con `ptyIdForPanel`; descarta los nulos.
     3. `invoke("pty_metrics", { ptyIds })`.
     4. para cada resultado, resuelve su `panelId` (via `leafIdForPty`) y
        `setMetrics(panelId, ...)`.
   - Intervalo en constante exportada (`TERMINAL_METRICS_INTERVAL_MS = 5000`).

6. **Integracion en `PanelContent.tsx`** (caso `terminal`)
   - Envolver `TerminalPane` en `flex h-full w-full flex-col`, con `TerminalPathBar`
     arriba y `TerminalPane` en `relative min-h-0 flex-1` (igual que el editor).
   - `cwd` viene de `panel.cwd`; `onReveal` -> `callbacks.onFocusOnExplorer?.(panel.cwd)`.

### Backend (Rust)

Funcional core puro + comando Tauri delgado.

1. **`sysinfo`** en `src-tauri/Cargo.toml`.

2. **Estado managed**: `struct ProcessMonitor(Mutex<sysinfo::System>)`, registrado con
   `app.manage(...)`. Persistir el `System` permite que sysinfo calcule el CPU% como
   delta real entre muestreos (de lo contrario el primer refresh da 0%).

3. **`src-tauri/src/modules/pty/metrics.rs`**
   - Funcional core puro (testeable sin sysinfo):
     ```
     struct ProcStat { parent: u32, cpu: f32, mem: u64 }
     fn aggregate_tree(procs: &HashMap<u32, ProcStat>, root: u32, num_cpus: usize)
         -> (f32 /*cpu_norm 0-100*/, u64 /*mem*/)
     ```
     Construye el set de descendientes de `root` (BFS por el mapa pid->parent) y suma
     cpu y mem del arbol completo (root incluido). Normaliza cpu dividiendo por
     `num_cpus` y haciendo clamp a `[0, 100]`.
   - Shell delgado: refresca el `System`, vuelca procesos a `HashMap<u32, ProcStat>`,
     obtiene el `shell_pid` de cada sesion y llama `aggregate_tree`.

4. **Comando `pty_metrics`** (en `pty/mod.rs`, registrado en `lib.rs`)
   - Firma: `pty_metrics(pty_ids: Vec<u32>, state, monitor) -> Vec<PtyMetrics>`.
   - `PtyMetrics { pty_id: u32, pid: u32, cpu_percent: f32, mem_bytes: u64, shell_name: String }`.
   - Por cada `pty_id`: localiza la sesion; si no existe o `shell_pid == 0`, omite.
     `shell_name` se deriva del proceso `shell_pid` (p. ej. `zsh`).
   - Refresca procesos una sola vez por invocacion (no por pty).

### Documentacion viva a actualizar (mismo commit que el codigo)

- `docs/IPC.md`: nuevo comando `pty_metrics`.
- `docs/ARCHITECTURE.md`: mencion de la TerminalPathBar y el store de metricas.
- `docs/FORK.md`: feature anadida que no existe en el upstream.

## Casos borde

- Sesion PTY cerrada o `shell_pid == 0`: se omite del resultado; la barra deja la
  ultima metrica o `-`.
- Primer muestreo: CPU puede salir 0/impreciso hasta el segundo tick (aceptable).
- Terminal no visible: no se muestrea (la barra solo se renderiza en el panel visible).
- Documento oculto (ventana en background): el sampler se salta el tick.
- Cierre de panel: `clearMetricsEntry` + `clearRunningCommandEntry`.
- Windows: `sysinfo` es cross-platform; mismo camino.

## Plan de tests (quality bar)

- **Rust**: `aggregate_tree` con un arbol sintetico (root + hijos + nieto + proceso
  ajeno que NO debe contar); verifica suma de cpu/mem y normalizacion/clamp.
- **Frontend**:
  - `visibleTerminalPanels`: arbol con splits, panes con panel activo terminal vs
    editor vs sin activo.
  - `formatCpu` / `formatMem`: redondeo, clamp, umbral MB/GB.

## Fuera de alcance (YAGNI)

- Dropdown de ajustes en la barra.
- Toggle para ocultar la barra (se puede anadir luego como preferencia global).
- Historico/grafica de CPU.
- Metricas de terminales no visibles.
