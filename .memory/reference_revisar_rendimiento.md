---
name: revisar-rendimiento
description: Cuando el usuario diga que Kex va lento o pida revisar el rendimiento, qué herramientas hay, en qué orden usarlas, cómo leer los resultados y qué se midió ya
metadata:
  node_type: memory
  type: reference
---

Las herramientas existen desde el 2026-10-20 y están documentadas para personas en `docs/BUILD.md`, apartado
"Profiling a slow window". Esto es lo que hay que saber para trabajar con ellas sin repetir el camino.

## Procedimiento

1. **Pide al usuario que encienda el profiler** desde la paleta ("Start performance profiler") en la instancia que va
   lenta y que siga trabajando hasta que la note lenta. Está apagado en cada arranque, así que hay que encenderlo
   cada vez. No hace falta reiniciar, y conviene no hacerlo: la lentitud puede tardar horas en aparecer.
2. **Cuando avise, saca un volcado nativo** con `scripts/sample-webview.sh` (con una sola instancia de Kex abierta
   no lleva argumentos; con varias hay que dar `--pid`, y el script las lista). Lo deja en la carpeta de logs de esa
   instancia, junto a `Kex.log`. Lo ideal es tener también un volcado cuando va bien, para comparar.
3. **Lee las líneas `[profiler]`** de `Kex.log` y de los `Kex_<fecha>.log` archivados (se conservan 20 de 1 MB;
   una línea ronda 1 KB y se escribe cada 10 s). Cada una es JSON tras el prefijo: `rafShare`, `jankFrames`,
   `worstGapMs`, `census` y `top`.
4. **Mira el proceso de GPU aparte.** Cuelga de la misma app y su CPU no aparece en el volcado de la webview.

## Cómo leer el volcado

Lo que cuenta es el hilo `main-thread` del proceso WebContent, repartido en estas ramas del árbol de llamadas:
`WebPage::updateRendering` (todo el ciclo de renderizado), y dentro `Document::updateLayout` (layout),
`Style::TreeResolver::resolve` (estilos CSS), `serviceRequestAnimationFrame` (el JavaScript que mide el profiler) y
`RenderLayerBacking::paintContents` (pintar). `mach_msg2_trap` es el hilo dormido. Los hilos "Heap Helper" y los
anónimos en `__workq_kernreturn` o `__psynch_cvwait` están ocupados en apariencia pero esperan; no cuentan.
El JavaScript sale sin nombres en el volcado, por eso existe el profiler.

Comparación medida el 2026-10-20 (hilo principal, porcentaje de las muestras):

| | Lenta | Sana |
|---|---|---|
| Dormido | 4 % | 62 % |
| `updateRendering` | 74 % | 19 % |
| Layout | 20 % | 5 % |
| Estilos | 17 % | 3 % |
| JavaScript en `requestAnimationFrame` | 14 % | 3 % |

Un hilo principal ocupado por encima del 90 % es el síntoma. El dato que lo distingue de un reposo es que el reparto
lo domine el renderizado de la página y no el JavaScript.

## Lo que se encontró (hipótesis, no confirmado)

- **El repintado de xterm es el mayor consumidor de JavaScript en `requestAnimationFrame`.** Un 95 % de ese tiempo
  viene de `_innerRefresh` disparado desde `resetModePrivate` de xterm (una secuencia `CSI ? ... l`), de 5 a 7 ms cada
  vez. Sospecha: es el fin de cada fotograma de salida sincronizada (modo 2026) que usan las TUI como Claude Code.
  No se comprobó qué modo llega.
- **Lo que consume más CPU en la lentitud es recalcular estilos y layout de un DOM grande**, no el JavaScript.
  Hipótesis fuerte, sin confirmar: `WEBGL_MAX_CONTEXTS` es 7 y a los 30 s de ocultar una terminal se le suelta el
  WebGL, así que las terminales ocultas caen al renderizador de DOM de xterm (un elemento por fila). Con 26 terminales
  y `backgroundMemoryBudgetMb` en 256 con 5000 líneas de scrollback (unos 7 MB cada una) ninguna se libera, y todas
  reescriben su DOM aunque no se vean. El campo `census` del profiler (`domRendererTerminals`, `domRows`) está para
  confirmarlo, y probar `backgroundMemoryBudgetMb` en 0 es la prueba más barata.
- **No se pudo atribuir cada repintado a una terminal visible u oculta.** Falta ese contador.
- **La lentitud no apareció en una instancia nueva con datos distintos.** Producción (`support`) y desarrollo
  (`support-dev`) no tienen los mismos workspaces: no comparar una con la otra.

## Trampas

- `ps` trunca `ucomm` a 16 caracteres, así que el nombre de los procesos de WebKit llega como `com.apple.WebKit`.
  Hay que mirar el comando completo.
- Los procesos de WebKit cuelgan de `launchd` (ppid 1). El vínculo con Kex es el proceso responsable
  (`responsibility_get_pid_responsible_for_pid`, desde Python con `ctypes`). La hora de arranque no vale: WebKit
  relanza un WebContent al abrir otra ventana, como Settings.
- No se puede mover ni redimensionar la ventana desde aquí: `osascript` no tiene permiso de accesibilidad. Si hace
  falta un redimensionado, lo hace el usuario mientras corre el volcado.
- Un build release desde una carpeta `target` nueva falla con Rust 1.96 por `strip = true` en `Cargo.toml`
  (`can't find crate for ...` en macros de procedimiento). Se evita con `CARGO_PROFILE_RELEASE_STRIP=none` en ese
  build. `pnpm buildlocal` desde cero fallaría igual.
- Para ver nombres de función legibles en un release hay que compilar con `build.minify: false` en `vite.config.ts`,
  solo en un worktree de usar y tirar. En el release normal las funciones locales salen con nombre mutilado.
- Instrumentar siempre en un worktree propio y no mezclar su código en `main` (ver
  `feedback_worktree_ownership.md`). El método de usar `fetch` a un servidor local sigue valiendo para medir cosas
  concretas (ver `reference_webview_debug_via_fetch.md`).
