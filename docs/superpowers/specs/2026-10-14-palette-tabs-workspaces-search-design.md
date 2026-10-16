# La paleta busca tabs y workspaces, y cubre todas las acciones y settings

## Problema

La paleta de comandos (`src/modules/command-palette/`) solo encuentra acciones. Para saltar a un tab o a un workspace hay que usar la WorkspaceBar o los atajos, y con muchos workspaces (varios hibernados) eso es lento. Ademas el catalogo de acciones se escribio a mano y se ha quedado atras: tiene 23 entradas frente a 62 atajos y 10 secciones de Settings (medido el 2026-10-14).

## Objetivo

1. Una sola caja que filtra al instante workspaces, tabs, acciones y settings.
2. Con la caja vacia, los 8 tabs usados mas recientemente, por orden de uso. Los de workspaces hibernados van al final.
3. Al escribir, el orden de relevancia es: titulo y nota del tab, y despues cwd, worktree, rama y proceso.
4. Cada fila de tab muestra un spinner si su agente trabaja y un icono de nota si tiene nota (nunca el de autofocus). Al seleccionarla (raton o teclado) se ve la nota.
5. Todas las acciones con atajo y todas las secciones de Settings tienen fila, y un test impide que vuelvan a quedarse atras.

Decisiones ya tomadas con el usuario:

- Elegir un setting abre la ventana de Settings en su seccion; no cambia el valor desde la paleta.
- Elegir un tab de un workspace hibernado lo despierta y salta a el, sin pedir confirmacion.
- Fuera de esta entrega: buscar por el cwd de terminales ya cerrados y abrir un tab nuevo en el ultimo workspace donde se uso (ver "Siguiente entrega").

## Lo que ya existe y se reutiliza

- `tabTitleVars` / `tabDir` (`workspaces/lib/titleVars.ts`) resuelven por tab el cwd, la rama, el repo, el comando en ejecucion y el agente.
- `dirGitStore` da `{ branch, repoRoot }` por directorio. El worktree se deduce del `repoRoot` cuando contiene `/.claude/worktrees/<nombre>` (sin consulta nueva).
- `tabStatusIndicator` + `workspaceDetailRows` ya deciden que tab esta "working" y con que visual. El spinner de la fila usa esa misma salida.
- `hasTabNote` (`tabNote.ts`) decide si hay nota. El icono de autofocus no se pinta nunca en la paleta.
- `goToTab(tabId)` en `App.tsx` activa el workspace y el tab y le da foco; `wakeWorkspace(id)` despierta un workspace hibernado.
- `fuzzyBest` / `fuzzyBestLower` (`lib/fuzzy.ts`) puntuan; `lib/mru.ts` guarda recencia en `localStorage`.

## Diseno

### Piezas

Todo el calculo vive en funciones puras testeables; los componentes quedan finos.

| Pieza | Que es | Donde |
|---|---|---|
| `tabUse` | Mapa `tabId -> epoch ms` del ultimo uso, en `localStorage` como `mru.ts`. API: `recordTabUse(tabId)`, `tabUseSnapshot()`, `pruneTabUse(liveIds)`. Tope de 300 entradas. Vive en el modulo de workspaces, no en la paleta, porque quien sella es `activateTab`; la paleta solo lo lee. | `workspaces/lib/tabUse.ts` |
| `buildTabEntries` | Dado workspaces, fuentes de titulo (rama, comando, agente), estados de agente y el snapshot de uso, devuelve una lista plana de `TabEntry`. Funcion pura. | `command-palette/lib/tabEntries.ts` |
| `rankTabEntries` | Dado entradas, termino y snapshot, devuelve las entradas ordenadas. Sin termino devuelve los 8 recientes. Funcion pura. | `command-palette/lib/tabRank.ts` |
| `buildActionCatalog` | Sustituye a la lista a mano de `commands.ts`: genera las acciones a partir de `SHORTCUTS` mas las que no tienen atajo, y las filas de Settings a partir de la lista de secciones. | `command-palette/commands.ts` |
| Filas de la UI | `TabItem`, `WorkspaceItem` y el panel de vista previa de la nota. | `command-palette/CommandPalette.tsx` y componentes nuevos junto a el |

`TabEntry`:

```ts
type TabEntry = {
  tabId: string;
  workspaceId: string;
  workspaceTitle: string;
  hibernated: boolean;
  kind: Tab["kind"];
  title: string;          // titulo ya expandido, el que ve el usuario
  note: string | null;
  cwd: string;
  worktree: string;       // "" si no esta en un worktree
  branch: string;
  process: string;        // comando en ejecucion o nombre del agente
  indicator: AgentEntryVisual | null;  // solo agentes accionables: working, attention, error
  lastUsedAt: number;     // 0 si nunca se uso
};
```

### Seguimiento del ultimo uso

Se sella `recordTabUse(tabId)` desde un unico efecto en `App.tsx` que depende del id del tab activo y de si su workspace esta hibernado. Asi cubre clics, atajos, tabs nuevos, cambios de workspace y el arranque, sin tocar `activateTab`. No se escribe en el cuerpo del tab ni en el JSON del workspace: cambiar de tab no debe ensuciar lo persistido. La poda con `pruneTabUse` desde las ids vivas ocurre al abrir la paleta, no en cada cambio de workspaces.

El mapa se lee una vez al abrir la paleta (mismo patron que `mruSnapshot`), no en cada tecla.

### Orden con la caja vacia

1. Los 8 `TabEntry` con mayor `lastUsedAt` cuyo workspace no esta hibernado.
2. Si no llegan a 8, se completan con los de workspaces hibernados, tambien por `lastUsedAt`.
3. Debajo, las acciones como hoy (ordenadas por su MRU).

Un tab sin ningun uso registrado (recien restaurado) cuenta como `lastUsedAt = 0`, y el desempate es el `lastActiveAt` de su workspace y despues el orden en el arbol.

### Orden al escribir

Cada tab entra en el nivel del mejor campo que coincide, y los niveles son estrictos: una coincidencia en un nivel siempre le gana a una en el siguiente, aunque la puntuacion del segundo sea mejor.

| Nivel | Campos | Como coincide |
|---|---|---|
| 0 | titulo del tab, nota | titulo difuso (fuzzy), nota por subcadena |
| 1 | nombre del workspace | difuso |
| 2 | cwd, worktree, rama | subcadena |
| 3 | proceso / agente | subcadena |

Los campos largos (rutas, notas, comandos) usan subcadena porque un fuzzy sobre una ruta larga casa con casi cualquier consulta corta. Dentro de un nivel manda la puntuacion y despues `byRecency` (workspace no hibernado primero, luego `lastUsedAt`, luego actividad del workspace, luego orden en el arbol). Los workspaces se puntuan por titulo difuso.

Las filas se agrupan con cabeceras en orden fijo: Tabs, Workspaces, las acciones por sus grupos de siempre y Settings. Los grupos vacios no se pintan. No se limita la lista mientras se escribe; el limite de 8 es solo para la caja vacia.

### Filas

- **Tab**: icono del tipo de tab, titulo, y a la derecha el nombre del workspace en gris. Un tab de workspace hibernado lleva el icono de luna/zzz y texto atenuado. Spinner si `indicator === "working"`, punto amarillo si `"attention"`, y el icono de nota si `note !== null`. Sin icono de autofocus.
- **Workspace**: icono y color del workspace, titulo, numero de tabs. Elegirlo lo activa (despertandolo si hace falta).
- **Accion / setting**: como hoy. Las filas de Settings llevan el icono de la seccion y la etiqueta "Settings".

### Vista previa de la nota

Con una fila de tab seleccionada (`value` del `Command`) cuyo `note` no es nulo, aparece un panel a la derecha de la lista con la nota renderizada como markdown de solo lectura y debajo cwd y rama. Sigue a la seleccion por teclado y por raton. Si no hay nota pero hay cwd o rama, el panel muestra solo esos datos; si no hay nada, no hay panel y la lista ocupa todo el ancho. El panel no roba foco ni intercepta teclas.

La nota se renderiza con la pieza de `MarkdownPreviewPane` (misma que el preview de solo lectura), cargada de forma perezosa para no pesar en el bundle inicial: solo se importa la primera vez que se selecciona una fila con nota.

### Catalogo de acciones y settings

- Cada entrada de `SHORTCUTS` se convierte en accion con su `group`, `label` y `shortcutId`, y su `run` llama al handler que `App.tsx` ya registra en `shortcutHandlers`. Si un atajo no tiene handler en ese mapa, la fila sale deshabilitada con "Not available here". Las acciones escritas a mano de `commands.ts` se mantienen y ganan sobre las generadas.
- Acciones sin atajo que reciben fila: quitar la nota del tab (solo habilitada si el tab tiene nota) y partir el pane a la derecha o abajo con un browser. Los workspaces se hibernan y despiertan con el atajo existente `workspace.hibernate`.
- Quedan para una entrega posterior: cerrar los otros tabs del pane, cerrar todos, mover el tab activo a otro workspace (subpagina como la de temas) y restablecer el titulo del tab. Necesitan funciones de pane que hoy no estan al alcance de la paleta. Lo parametrico no recibe fila: renombrar grupos, mover un workspace a otro grupo, ejecutar un script concreto por nombre y los pickers de color e icono.
- Settings: una fila por seccion, a partir de `src/modules/settings/sections.ts` (`SETTINGS_SECTIONS`), que consumen `SettingsApp.tsx` (le anade su `component`) y la paleta. No se puede importar `SECTIONS` desde `SettingsApp.tsx`: arrastraria el arbol completo de Settings al bundle de la ventana principal. `external-editors` se etiqueta "Tools" y `filetypes` admite el deep-link `filetypes:<ext>`.
- Test de cobertura (`commands.test.ts`): recorre `SHORTCUTS` y `SETTINGS_SECTIONS` y falla si alguno no tiene fila. Las excepciones viven en `UNLISTED_SHORTCUTS`, cada una con su motivo: `commandPalette.open`, `file.copy`, `file.cut`, `file.paste`, `file.delete`, `editor.undo`, `editor.redo`, `tab.next`, `tab.prev`, `pane.focusUp`, `pane.focusDown`, `pane.focusLeft`, `pane.focusRight`, `workspace.prev`, `workspace.next`, `tab.selectByIndex`, `workspace.selectByIndex`. `commandPalette.content` lo cubre la fila `search.content`. Otro test falla si una excepcion apunta a un atajo que ya no existe.
- Grupos del catalogo (`COMMAND_GROUPS`, en orden de pintado): General, Tabs, Panes, Terminal, Editor, Sidebar, Explorer, View, Git, Search y Settings.

### Flujo al elegir una fila

- Tab: `runAfterClose` cierra la paleta; despues, si el workspace esta hibernado, `await wakeWorkspace(id)`; despues `goToTab(tabId)`. `recordTabUse` se sella dentro de la activacion, no en la paleta.
- Workspace: igual, con `setActiveWorkspaceId`.
- Si el tab desaparece entre abrir la paleta y elegirlo (se cerro un agente, por ejemplo), `goToTab` ya no hace nada porque `findTabGlobal` devuelve null; no hay error visible.

### Rendimiento

- La paleta ya construye `commandItems` solo mientras esta abierta; `buildTabEntries` sigue esa regla y no corre con la paleta cerrada.
- Coste por apertura: O(numero de tabs). Con cientos de tabs sigue en microsegundos; se mide con un test de rendimiento de humo (1000 tabs, menos de 20 ms por pulsacion).
- Las ramas se leen de `getDirGit` (cache en memoria); la paleta no lanza consultas git nuevas ni pide IPC.
- El panel de nota y el renderer de markdown se cargan bajo demanda.

### Errores y casos limite

- Workspace sin tabs: aparece como fila de workspace, sin tabs debajo.
- Tab sin cwd (browser, git-history): se busca por titulo y nota; para git-history, el `repoRoot` cuenta como cwd.
- Dos tabs con el mismo titulo: la fila de workspace a la derecha los distingue; si siguen iguales, el cwd corto se pinta bajo el titulo en gris.
- Nota vacia (`""`): cuenta como "sin nota" para el icono y el panel.
- Modos `#` y `>` no cambian. La busqueda unificada solo vive en el modo de comandos.
- La subpagina de temas no cambia.

## Tests

- `tabEntries.test.ts`: construccion de entradas con y sin rama, worktree detectado, tab hibernado, tab con nota vacia.
- `tabRank.test.ts`: caja vacia (8 recientes, hibernados al final, relleno con hibernados), prioridad titulo sobre cwd, nota, desempate por uso, termino sin resultados.
- `tabUse.test.ts`: sellado, poda, tope de entradas, `localStorage` inaccesible.
- `commands.test.ts`: cobertura de `SHORTCUTS` y de secciones de Settings.
- Tests del componente solo para el flujo de seleccion (hibernado despierta y navega), el resto va a la pura.

## Documentacion que cambia

`docs/ARCHITECTURE.md` (mapa del modulo `command-palette`), `docs/WORKSPACES.md` si se documenta el sellado de uso por tab, y la tabla de glosario de `CLAUDE.md` si aparece un termino nuevo.

## Siguiente entrega (no incluida)

Buscar por el cwd de terminales cerrados y abrir un tab nuevo en el ultimo workspace donde se uso ese cwd. Para no cerrarle la puerta, `ClosedEntry` y `tabUse` pueden guardar `{ cwd, workspaceId, closedAt }` cuando un terminal se cierra; esta entrega no lo implementa ni pinta nada de ello. Lo que si deja resuelto es que `rankTabEntries` acepta una fuente mas de candidatos sin cambiar su firma.
