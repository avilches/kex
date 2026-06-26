> [!NOTE]
> **Active handoff:** Esta nota registra donde quedó la sesión anterior, solo informativa.
> Para retomar el trabajo, ejecutar `/handoff load` (read-only: resume el estado y continúa).
> NO ejecutar `/handoff` a secas ni regenerar nada solo porque este fichero esté cargado en contexto.

## Branch / worktree

- Rama: `main`
- Worktree: ninguno activo (todo está en el repo principal)

## Ficheros modificados respecto al commit inicial de la feature

Commits en `main` después de `929bc0f` (el commit original de terminal-links):

- `d466cb1` — `refactor(terminal): remove CLAUDE_PATTERNS, OSC 8 already handles those links` — otro agente eliminó los patrones específicos de Claude Code (`Write(path)`, `Wrote N lines to`)
- `1c1f86d` — `debug(terminal): log registerTerminalLinks init and every provideLinks call` — añadido log de init y log dentro de `provideLinks`
- `83104fe` — `debug(terminal): add mousemove listener to diagnose event propagation`
- `bb20f7e` — `debug(terminal): also listen on .xterm-screen to trace event path`

Fichero principal de interés: `src/modules/terminal/lib/terminalLinks.ts`

## Bugs activos

### Bug 1: `provideLinks` nunca se llama (regex links no funcionan)

Los logs que SÍ aparecen en consola:
```
[links] mousemove reaches .xterm-screen
[links] mousemove reaches term.element
```

El log añadido por el agente anterior (dentro de `provideLinks`) **NUNCA aparece**, lo que significa que xterm.js nunca invoca el `ILinkProvider.provideLinks` registrado, aunque el terminal ES visible e interactivo (los mousemove llegan).

**Consecuencia**: los regex links (Cmd+click) no funcionan en absoluto.

**Líneas de investigación prioritarias:**
1. ¿Se está llamando `providerDisposable.dispose()` prematuramente? Los `oscDisposers` se limpian cuando el slot es reapado o desvinculado de un leaf. Si el slot rota entre panels, la disposición elimina el LinkProvider y no se re-registra.
2. ¿Require xterm.js 6 que el terminal esté en el DOM visible (no en el recycler) cuando se llama `registerLinkProvider`? El registro se hace mientras el terminal está en el recycler (`left:-99999px`). Puede que el link provider se vincule al DOM en ese momento y no funcione tras ser movido.
3. ¿Hay un problema de timing? `registerLinkProvider` se llama en `createSlot` (una sola vez por terminal). Si xterm.js no encuentra el elemento en el DOM correcto en ese momento, puede fallar silenciosamente.
4. Verificar en `rendererPool.ts` si hay algún path de cleanup que llame `oscDisposers` sin re-registrar el link provider. Buscar todos los sitios donde se llama a los `oscDisposers`.

**Pista clave**: los mousemove listeners tienen `{ once: true }`, así que solo disparan una vez (eso es correcto). El problema es que el mecanismo INTERNO de xterm.js para invocar `provideLinks` nunca se activa.

### Bug 2: OSC 8 / links de fichero abren en Finder en vez del editor

Los links de fichero (detectados por xterm.js, probablemente OSC 8 o la detección nativa) abren en el Finder del sistema en vez de en un tab del editor de Kex.

**Causa probable**: el bridge no está configurado. `configureTerminalLinkBridge` en `App.tsx` registra los handlers en un `useEffect([], [])`. Si ese effect no se ha ejecutado, `_handler` en `terminalLinkBridge.ts` es `null`, y `dispatchFileLink` es un no-op. xterm.js podría entonces caer al comportamiento por defecto del navegador para `file://` URIs, que en Tauri/WebKit abre el fichero en el Finder.

**Verificación rápida**: añadir un log en `terminalLinkBridge.ts`:
```typescript
export function configureTerminalLinkBridge(...) {
  console.log("[bridge] configured");  // ¿aparece este log al arrancar?
  _handler = opts.onFileLink;
  ...
}
```
Si no aparece `[bridge] configured`, el `useEffect` en App.tsx no se está ejecutando.

**Causa alternativa**: el `linkHandler` está siendo eliminado por la función de dispose (`term.options.linkHandler = undefined`) cuando el slot rota. Si el slot se reutiliza para otro panel, el dispose borra el `linkHandler` y los clicks de OSC 8 van al comportamiento por defecto.

## Estado del código en `terminalLinks.ts`

- `DEBUG_LINKS = true` está activo (dejar así durante el debug)
- Los `CLAUDE_PATTERNS` (`Write(path)`, `Wrote N lines to`) fueron eliminados en `d466cb1`; actualmente solo hay `PATH_PATTERNS` (4 patrones generales)
- El `linkHandler` para OSC 8 está configurado
- El `ILinkProvider` está registrado pero `provideLinks` no se invoca

## Pending work / Next steps

1. **Diagnosticar Bug 1** (prioritario): determinar por qué `provideLinks` nunca se llama
   - Añadir log en `configureTerminalLinkBridge` para verificar que el bridge se configura
   - Añadir log al inicio de `provideLinks` antes de cualquier condición
   - Verificar si `oscDisposers` está siendo llamado prematuramente (buscar todos los callers de `oscDisposers` en `rendererPool.ts`)
   - Probar si mover `registerTerminalLinks` al momento en que el slot se VINCULA a un leaf (en lugar de en `createSlot`) hace que funcione

2. **Diagnosticar Bug 2**: añadir log en `dispatchFileLink` para confirmar si se llama al hacer click en un link OSC 8; confirmar que `configureTerminalLinkBridge` se ejecuta al arrancar

3. **Restaurar CLAUDE_PATTERNS** una vez que la infraestructura funcione: el commit `d466cb1` los eliminó pero son necesarios para detectar output de Claude Code como texto plano (Claude Code NO emite OSC 8)

4. **Limpiar debug logs** una vez resueltos los bugs (eliminar `DEBUG_LINKS` y todos los `console.log`)

## Suggested skills

- `superpowers:systematic-debugging` — hay dos bugs, con síntomas claros y pistas concretas; usar debugging sistemático para aislar cada causa raíz antes de tocar código
