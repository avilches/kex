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
  una linea (resumen) y se despliegan una a la vez con click, como archivos de extension en
  `FileTypesSection` y tarjetas de Action en `ActionRow`/`ActionsEditor`. Un borrador aun no
  guardado siempre permanece desplegado.
- **Borrado con confirmacion**: cualquier removida de una fila guardada (tarjeta de Action en
  `ActionRow`, entrada de extension en `FileTypesSection`) abre `AlertDialog` y solo llega al
  store con el boton destructivo confirmado.
- **Popovers dentro de un Dialog modal**: el Dialog modal pone `pointer-events: none` en el
  body y el contenido de un Popover se portal a body, quedando muerto para el raton (el
  teclado sigue). En el codebase esta regla esta resuelta con `pointer-events-auto` en el
  className del `PopoverContent` afectado: referencias vivas `AddApplicationMenu.tsx` y el
  popover de Make global en `ActionRow.tsx`. Aplicarla a todo popover que abra dentro de
  `WorkspaceSettingsDialog` o de otros modales.
- **Conteo apagado en triggers**: los menus agrupados de `ActionsBar` muestran un numero
  apagado junto al label del trigger con las filas que contienen (workspace + global).

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
