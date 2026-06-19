# F9 - Operaciones de fichero en el explorer (duplicar, copiar/pegar, cortar, borrar) + limpieza del menu

**Prioridad:** Media
**Esfuerzo:** Medio

## Contexto

El menu contextual del explorer y las operaciones por teclado estan incompletos. Se quieren anadir operaciones de fichero habituales y limpiar una opcion que sobra.

## Cambios pedidos

1. **Duplicar fichero**: nueva opcion en el menu contextual del explorer que cree una copia del fichero seleccionado (p. ej. `nombre copy.ext`).
2. **Copiar / pegar fichero**: opciones de copiar y pegar. Si la operacion previa fue **cortar**, el pegado debe **mover** el fichero en vez de copiarlo.
3. **Borrar con `Supr`**: la tecla Suprimir borra el fichero seleccionado (el que esta debajo del foco). IMPORTANTE: que sea `Delete`/`Supr`, NO `Backspace`, para no borrar por accidente.
4. **Quitar la opcion "attach to agent"** del menu contextual.

## Notas de implementacion

- Borrar / copiar / pegar / cortar por teclado son acciones de la app con atajo: cada una necesita su `id` en `src/modules/shortcuts/shortcuts.ts` (reasignable desde Settings), su `ShortcutId` en el union type, y el handler conectado. No comparar teclas a mano (`e.key === "Delete"`); usar `matchesShortcut(...)` en el handler local del explorer o `useGlobalShortcuts` con `isDisabled` contextual segun donde este el foco.
- Mover/copiar usan los comandos fs existentes (`fs_rename` para mover, lectura+escritura o un comando nuevo para copiar). Validar colisiones de nombre y errores (no silenciar, ver BUG-30).
- Depende de F8 para que las operaciones por teclado tengan sentido (explorer enfocado).
- Cross-platform: normalizar separadores de ruta (`.split(/[\\/]/)`), forma canonica forward-slash en el frontend.

## Criterios de aceptacion

- Menu contextual con "duplicar", "copiar", "pegar"; "attach to agent" ya no aparece.
- Cortar + pegar mueve; copiar + pegar duplica.
- `Supr` borra el fichero enfocado; `Backspace` no borra nada.
- Los atajos aparecen en Settings y son reasignables.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde.
