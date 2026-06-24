# F11 - Boton para abrir el proyecto en un IDE/editor/terminal externo

**Prioridad:** Urgente
**Esfuerzo:** Medio

## Contexto

Inspirado en Supacode, Emdash y Nimbalyst: un icono/boton en la barra superior que abre el proyecto actual en un IDE, editor o terminal externo. Al pulsarlo despliega la lista de las aplicaciones detectadas en el sistema y lanza la elegida sobre la carpeta del workspace activo.

## Cambios pedidos

1. **Deteccion de aplicaciones** instaladas: familia JetBrains (IntelliJ IDEA, PyCharm, WebStorm, ...), VS Code, Cursor, Zed, Sublime Text, y terminales (iTerm, etc.).
2. **Boton en la barra superior** con un dropdown que lista las apps detectadas, cada una con su icono.
3. **Abrir el proyecto**: al elegir una app, lanzarla con la carpeta del proyecto actual (cwd del panel activo o root del workspace) como argumento.

## Notas de implementacion

- Deteccion cross-platform en Rust (nueva IPC, p. ej. `system_detect_launchers` -> `Vec<{ id, name, kind, exec/bundleId, iconPath? }>`), cacheada:
  - macOS: rutas en `/Applications` + Spotlight (`mdfind`), o los CLIs (`code`, `cursor`, `idea`, `pycharm`, `subl`, `zed`).
  - Linux: ficheros `.desktop` + binarios en PATH.
  - Windows: registro / rutas conocidas.
- Lanzamiento via IPC `system_open_in(launcherId, path)`. En macOS preferir `open -b <bundleId> <path>` o el CLI del editor.
- Validar el path en el boundary (no pasar rutas arbitrarias sin comprobar). Respetar la autorizacion de cwd del workspace si aplica.
- UI: boton en `src/modules/header/` con dropdown (primitivas shadcn). Si nace un modulo nuevo (`launchers/` o similar), documentarlo.
- Perf: la deteccion es la parte cara; cachear el resultado y refrescar bajo demanda, no en cada apertura del menu.

## Documentacion viva a actualizar al implementar

- `docs/IPC.md`: nuevas IPC de deteccion y lanzamiento.
- `docs/ARCHITECTURE.md` + `AGENTS.md`: modulo nuevo o ampliacion de `header/`.
- `docs/FORK.md`: feature anadida respecto al upstream.

## Criterios de aceptacion

- El boton lista las apps realmente instaladas en el sistema (sin entradas muertas).
- Elegir una app la abre con la carpeta del proyecto actual.
- Cross-platform (macOS / Linux / Windows) o, si se acota, documentar que plataformas cubre la primera version.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde; `cargo clippy` y `cargo test --locked` en verde.
