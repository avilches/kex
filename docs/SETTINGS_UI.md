# Settings UI

Donde vive cada ajuste y como se pintan los controles de la ventana de Settings. Movido desde `CLAUDE.md`.

## Settings del editor: donde vive cada ajuste

Al anadir un ajuste al editor hay que ubicarlo segun su alcance:

- **Ajuste por extension de archivo** (vive en `editorViewByExt`, resuelto con `resolveEditorView`): SIEMPRE va en el menu contextual del editor (el dropdown `[...]` de `EditorPathBar`), en su seccion "por extension". No va en la ventana de Settings (esa es global).
- **Ajuste global del editor** (preferencia top-level del store): va en DOS sitios: en su grupo "Global" del menu contextual `[...]` y tambien en la ventana de Settings, en la seccion `Editor` (`EditorSection`). Los ajustes globales del terminal van en `TerminalSection`, los de apariencia (fuente de la interfaz) en `AppearanceSection` y los de temas en `ThemesSection`.
- **Ajuste solo-JSON**: algunas preferencias no tienen UI y se editan a mano en `settings-general.json` o `settings-editor.json`. Marcalas con un comentario `// JSON-only` en el tipo `Preferences` de `store.ts` y listalas en `docs/ARCHITECTURE.md`. Hoy son `editorHighlightActiveLine`, `editorAutoSaveDelay`, `workspacePaneLimit`, `paneSplitLimit`.

Asi el usuario puede tocar lo visual rapido desde el editor y la configuracion global queda accesible tanto en contexto como en la pantalla de ajustes.

## Controles de formulario en Settings

Usar siempre los componentes de shadcn, nunca elementos HTML nativos con estilos ad-hoc:

- **Radio buttons**: `RadioGroup` + `RadioGroupItem` de `@/components/ui/radio-group`. Patron:
  ```tsx
  <RadioGroup value={value} onValueChange={(v) => handler(v as MyType)}>
    <div className="flex items-center gap-2">
      <RadioGroupItem value="opt-a" id="my-opt-a" />
      <label htmlFor="my-opt-a" className="cursor-pointer text-[12px]">Label</label>
    </div>
  </RadioGroup>
  ```
- **Checkboxes**: `Checkbox` de `@/components/ui/checkbox` con `id` y `<label htmlFor={...}>` asociado.
- **Switches**: `Switch` de `@/components/ui/switch` (para toggles on/off dentro de `SettingRow`).

Referencia viva: `TerminalSection.tsx` (RadioGroup en scratchpad), `ActionRow.tsx` en `src/modules/actions/` (Checkbox y Select en un formulario).

## Patrones que se repiten

- **Tarjetas plegables**: las filas de configuracion que abren un formulario van plegadas a
  una linea (resumen) y se despliegan una a la vez con click, como las Actions de la columna de Settings en
  `ActionsSection`. Las Actions ya no se despliegan: cada una es una fila fija y su edicion
  vive en un modal (`ActionEditDialog`), abierto con el lapiz de la fila.
- **Borrado con confirmacion**: cualquier removida de una fila guardada (fila de Action en
  `ActionRow`) abre `AlertDialog` y solo llega al
  store con el boton destructivo confirmado. Excepcion: una Action inmutable de app (`appId`
  presente) se borra sin pedir nada, porque vuelve una sola eleccion en el combo.
- **Popovers dentro de un Dialog modal**: el Dialog modal pone `pointer-events: none` en el
  body y un popover portalizado a body queda muerto para el raton (y `RemoveScroll` se come la
  rueda). El patron vigente es `DialogScrollHost` (`src/components/dialogScrollHost.tsx`): el
  dialogo expone su nodo scrolleable via contexto y el popover se renderiza dentro con
  `container={host}` manteniendo `pointer-events-auto` en el `PopoverContent`; referencias
  vivas `AddActionMenu.tsx` (combo Add) en la ventana de Settings.
  Aplicarla (con su provider, `WheelScrollDialogHost` en `WorkspaceSettingsDialog.tsx`) a todo
  popover que abra dentro de `WorkspaceSettingsDialog` o de otros modales.
- **Variables de commando de Action** (`commandTemplate.ts`, `COMMAND_VARIABLES`): `{cwd}`,
  `{dir}`, `{branch}`, `{repo}`, `{workspace}`, `{filename}`, `{filepath}` y `{host}`. Los
  nombres canonico son `{filepath}` y `{filename}` (los antiguos `{path}`/`{file}` ya no
  existen); los presets de JetBrains solo ofrecen las variantes de workspace y cwd porque sus
  editores no abren ficheros sueltos.
- **Boton "+"**: sin acciones, la ActionsBar muestra el trigger punteado "+" (solo el
  simbolo, sin palabra) que abre Settings > Actions directamente, sin menu intermedio
  ni borrador de script. Con acciones, el trigger reaparece al pasar el raton por la barra.
- **Barra del Header**: un solo menu "Actions" con todas las Actions sin boton propio, bajo
  el titulo "Global actions" primero y despues "Workspace actions" (los titulos se pintan
  solo cuando hay acciones de los dos alcances), cada alcance en su orden; la ultima entrada
  es "Action Settings" con el engranaje, que abre Settings > Actions; el click en el nombre
  de un script en marcha lleva a su tab sin cerrar el menu. Un comando
  sin variables (una app, o un script con Run in Workspace root) sale en gris mientras el workspace no tenga
  raiz, porque ejecutaria en ella; las acciones atadas a una carpeta o un fichero siguen su
  propia variable.
- **Editor de Actions en Settings**: dos columnas, This workspace (con el nombre del workspace debajo) a la izquierda y Global a la derecha, cada una con
  un unico combo Add (Add script primero, luego el grupo Agents con los presets de agentes y luego el grupo Applications con Custom arriba y los presets de apps). El
  combo no se cierra al elegir un preset (se pueden anadir varios de una vez) y no muestra
  los que ya tiene alguna app del ambito (se reconocen solo por el comando, sin contar espacios a los lados; el nombre y el `appId` no importan). La fila es asa, icono,
  nombre con subtitulo, lapiz grande y la X de borrar a la derecha del todo (sin casilla
  Button); el lapiz, o un doble click en la fila, abre `ActionEditDialog`: radio Global / This
  workspace (dos cajas como las cabeceras de columna, con el nombre del workspace), Run in folder primero en los scripts (Home por defecto, Workspace root con la
  chincheta del explorer, Current folder, Absolute path), nombre, comando y variables, y
  `OwnButtonChoice` (radio Own button / Inside the combo con una vista previa de la barra);
  guarda al escribir y se sale con Done. Arrastrar una fila a la otra columna la
  mueve de ambito (al final de su tipo); si es una app y el destino ya tiene otra con
  exactamente el mismo comando, la sobreescribe en su sitio con el nombre de la que llega
  (los scripts nunca se fusionan). Una Action de preset se edita igual que cualquiera:
  una app es un preset solo por su comando: al cambiarlo deja de serlo (`ownedAfterEdit`,
  conserva el icono en `iconId`) y el preset vuelve al combo, y si el comando vuelve a ser el
  del preset lo recupera; el nombre y Own button / Inside the combo no cuentan.
  El combo Add pone Add script arriba y Custom como primera app y es alto, porque hay sitio. Borrar una de preset no pide confirmacion, una de
  usuario si abre `AlertDialog`.
  Donde un nombre lleva dos lineas (fila de Settings, boton del Header, menu, combo Add) el icono de app mide lo que dice `actionIconSize`
  (`ActionIcon fill`, el mismo en todos los sitios, centrado sobre las dos lineas de `ActionNameLines`; slider de 14 a 32px, 20 por defecto, en Settings > Appearance > Action icon size) y el play/stop de un script ocupa
  toda la altura de su fila, igual que el hover del nombre. El selector de ambito del modal son dos botones pequenos arriba a la
  derecha (This workspace, Global), sin radio.
- **Nombres en dos lineas**: un nombre de Action con `{variable}` muestra debajo, en mono
  pequeno, lo que el lugar actual da a esa variable via `ActionNameLines.tsx` y
  `actionSubtitle`: `{workspace}` dice "Workspace" (sin raiz configurada, "Set a root to
  this workspace"), `{filepath}` solo el nombre del fichero y `{cwd}` la ruta con el
  principio recortado (el mismo truco de la fila "Copy absolute path", ahora compartido en
  `src/components/StartTrimmed.tsx`). Un script sin variable en el nombre dice donde corre
  (`scriptSubtitle`, segun su Run in): "Workspace", "Current folder" (la ruta real fuera de
  Settings) o la carpeta fija. Las superficies donde se pinta el nombre: boton propio
  del header, menu Unico del header, submenu contextual, combo Add y fila de Settings. El hover de una fila dice donde abre via `actionRowTitle`: `Open <nombre> in <ruta>`
  para workspace y carpeta, `Open <fichero> with <nombre>` para fichero. El ancho del boton
  propio se mide solo con el nombre principal.
- **Conteo apagado en trigger**: el menu Unico de `ActionsBar` muestra un numero apagado
  junto al label con las filas que contiene (workspace + global).

## Estilo de inputs en Settings

Todos los `<input>` nativos en pantallas de settings deben usar este patron exacto:

```
"h-8 w-full rounded border border-border bg-transparent px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
```

Diferencias importantes respecto a inputs generales:
- **`focus:outline-none focus:ring-1 focus:ring-ring`** (NO `focus-visible:ring-1`): evitar el borde azul del SO en navegacion con Tab.
- `bg-transparent` (no `bg-background`): hereda el fondo del panel de settings.
- Referencia viva: la constante `INPUT_CLASS` de `src/settings/components/inputClass.ts`.

Para botones de tab dentro de dialogs/modals (como `WorkspaceSettingsDialog`):
- Anadir `outline-none focus-visible:outline-none` para eliminar el borde de foco del sistema operativo.

## Editor de textos en dev

Solo con `pnpm tauri dev` (el modulo se carga detras de `import.meta.env.DEV`, un build de produccion no lo lleva): clic derecho sobre un texto de la ventana de Settings, o sobre un icono con tooltip o un campo con placeholder que no sea un input, abre un editor (`src/settings/devTextEditor/SettingsTextEditor.tsx`) con Save y Restore. El cambio se ve al instante y se re-aplica solo cuando React repinta o cambias de seccion (`reconcile.ts`, un `MutationObserver`). Sobre un `input`, `textarea` o `select` se conserva el menu nativo.

- La fuente de verdad es `SETTINGS_TEXTS.md` en la raiz del repo (ignorado por git), que lee y escribe el plugin `scripts/settings-texts-plugin.ts` por `GET/POST /__kex-settings-texts`. Por eso el cambio sobrevive a recargar o a cerrar y reabrir Settings, y desaparece cuando un agente aplica la entrada y la borra del fichero.
- Cada entrada lleva la seccion, el texto original y el nuevo, como cadenas JSON. El fichero trae la instruccion para el agente en su cabecera.
- Un cambio se identifica por el texto exacto que se ve, no por su sitio en el codigo: el mismo texto en dos sitios cambia en los dos. Un texto con valores interpolados se guarda como se ve.
- Guardar un texto igual al original equivale a Restaurar.
