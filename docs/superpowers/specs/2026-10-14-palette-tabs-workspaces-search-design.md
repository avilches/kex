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
| `tabUse` | Mapa `tabId -> epoch ms` del ultimo uso, en `localStorage` como `mru.ts`. API: `recordTabUse(tabId)`, `tabUseSnapshot()`, `pruneTabUse(liveIds)`. Tope de 300 entradas. | `command-palette/lib/tabUse.ts` |
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
  indicator: TabStatusIndicator;
  lastUsedAt: number;     // 0 si nunca se uso
};
```

### Seguimiento del ultimo uso

Se sella `recordTabUse(tabId)` donde un tab pasa a ser el activo de su pane y su workspace es el activo. El punto unico es `activateTab` del hook de workspaces, mas el cambio de workspace activo (que activa su tab actual). No se escribe en el cuerpo del tab ni en el JSON del workspace: cambiar de tab no debe ensuciar lo persistido. Al cerrar el tab se poda con `pruneTabUse` desde las ids vivas.

El mapa se lee una vez al abrir la paleta (mismo patron que `mruSnapshot`), no en cada tecla.

### Orden con la caja vacia

1. Los 8 `TabEntry` con mayor `lastUsedAt` cuyo workspace no esta hibernado.
2. Si no llegan a 8, se completan con los de workspaces hibernados, tambien por `lastUsedAt`.
3. Debajo, las acciones como hoy (ordenadas por su MRU).

Un tab sin ningun uso registrado (recien restaurado) cuenta como `lastUsedAt = 0`, y el desempate es el `lastActiveAt` de su workspace y despues el orden en el arbol.

### Orden al escribir

Cada candidato recibe una puntuacion con campos pesados, no un blob unico:

| Campo | Peso |
|---|---|
| titulo del tab, nota | 100 |
| nombre del workspace | 60 |
| cwd, worktree, rama | 30 |
| proceso / agente | 20 |
| workspace como entidad propia (fila de workspace) | 80 |

La puntuacion es la del mejor campo multiplicada por su peso (fuzzy normalizado a 0..1). Una coincidencia en titulo siempre le gana a una en cwd, aunque el fuzzy del cwd sea mejor. Desempates: workspace no hibernado primero, luego `lastUsedAt`. Las acciones y los settings entran en la misma lista con peso 70 para titulo y 40 para keywords, de modo que escribir "hibernate" muestre la accion antes que un tab cuyo cwd contiene esa palabra.

Las filas se agrupan con cabeceras en este orden fijo: Tabs, Workspaces, Actions (con sus grupos de siempre), Settings. Los grupos vacios no se pintan. Dentro de cada grupo manda la puntuacion. No se limita la lista mientras se escribe; el limite de 8 es solo para la caja vacia.

### Filas

- **Tab**: icono del tipo (o el `icon` propio del tab), titulo, y a la derecha el nombre del workspace en gris. Un tab de workspace hibernado lleva el icono de luna/zzz y texto atenuado. Spinner si `indicator === "working"`, punto amarillo si `"attention"`, y el icono de nota si `note !== null`. Sin icono de autofocus.
- **Workspace**: icono y color del workspace, titulo, numero de tabs. Elegirlo lo activa (despertandolo si hace falta).
- **Accion / setting**: como hoy. Las filas de Settings llevan el icono de la seccion y la etiqueta "Settings".

### Vista previa de la nota

Con una fila de tab seleccionada (`value` del `Command`) cuyo `note` no es nulo, aparece un panel a la derecha de la lista con la nota renderizada como markdown de solo lectura y debajo cwd y rama. Sigue a la seleccion por teclado y por raton. Si no hay nota pero hay cwd o rama, el panel muestra solo esos datos; si no hay nada, no hay panel y la lista ocupa todo el ancho. El panel no roba foco ni intercepta teclas.

La nota se renderiza con la pieza de `MarkdownPreviewPane` (misma que el preview de solo lectura), cargada de forma perezosa para no pesar en el bundle inicial: solo se importa la primera vez que se selecciona una fila con nota.

### Catalogo de acciones y settings

- Cada entrada de `SHORTCUTS` se convierte en accion, con su `group`, `label` y `shortcutId`. Las que ya existen en `commands.ts` con `run` propio mantienen su implementacion; las demas necesitan un `run` en `CommandPaletteActionContext`.
- Acciones sin atajo que reciben fila: hibernar/despertar el workspace activo (una sola fila toggle que dice "Restore" cuando esta hibernado), quitar la nota del tab (complemento de `tab.note`), devolver el tab a su titulo por defecto cuando tiene titulo propio, cerrar los otros tabs del pane, cerrar todos los tabs del pane, mover el tab activo a otro workspace (subpagina de workspaces, como la de temas) y split de browser a la derecha y abajo. Lo parametrico no recibe fila: renombrar grupos, mover un workspace a otro grupo, ejecutar un script concreto por nombre y los pickers de color e icono (el dialogo Properties ya los expone).
- Settings: una fila por seccion. La lista sale de un modulo nuevo compartido y sin componentes, `src/modules/settings/sections.ts`, que exporta `{ id: SettingsSection; label: string; icon }[]` y lo consumen `SettingsApp.tsx` (que solo le anade su `component`) y la paleta. No se puede importar `SECTIONS` desde `SettingsApp.tsx` directamente: esa entrada es el webview `settings.html` y arrastraria el arbol completo de Settings al bundle de la ventana principal. `openSettingsWindow(section)` acepta el id. Ojo: `external-editors` se etiqueta "Tools" (el id no es el label) y `filetypes` admite el deep-link `filetypes:<ext>`.
- Test de cobertura: recorre `SHORTCUTS` y `sections.ts` y falla si alguno no tiene fila en el catalogo. Excepciones explicitas con su motivo (inventario medido el 2026-10-14): `commandPalette.open` (ya se esta dentro de la paleta), `commandPalette.content` (lo cubre la fila existente `search.content` anadiendole su `shortcutId`), `file.copy`, `file.cut`, `file.paste`, `file.delete` (edicion in-situ sobre la seleccion local del explorer: la fila perderia el objetivo al cerrarse la paleta), `editor.undo`, `editor.redo` (transaccion del buffer del editor enfocado), `tab.next`, `tab.prev`, `pane.focusUp`, `pane.focusDown`, `pane.focusLeft`, `pane.focusRight`, `workspace.prev`, `workspace.next` (navegacion relativa sin objetivo seleccionable en una lista), `tab.selectByIndex`, `workspace.selectByIndex` (handler parametrizado por la tecla digito).
- Grupos del catalogo: los 8 de `SHORTCUTS` (General, Sidebar, Explorer, Tabs, Panes, Terminal, View, Editor), los dos propios de la paleta (Git y Search) y uno nuevo, Settings. `COMMAND_GROUPS` pasa a ser esa lista, en el orden de pintado.

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
