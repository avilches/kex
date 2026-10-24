# Rendimiento de Kex

Lee esto entero antes de investigar cualquier queja de lentitud, congelaciones, CPU o memoria. Resume lo que se
construyó el 2026-10-20 y 21, lo que se midió y lo que sigue siendo hipótesis. Las herramientas son de macOS.

## Si el usuario dice "mira el rendimiento, mi app va lenta"

Trabaja en este orden. Todo se lanza desde la raíz del repositorio con `python3 performance/kexperf.py <subcomando>`.

1. **`status`**: qué Kex hay abiertos, sus procesos de webview y la CPU de cada uno. Fíjate en el proceso de GPU
   (`gpu`): su CPU no aparece en ningún volcado de la webview y ya se vio al 25 % con la webview holgada.
   Si hay varios Kex, el que importa es el que el usuario dice que va lento; casi siempre es el de producción
   (`/Applications/Kex.app`), no el `target/debug/kex`.
2. **`profiler --hours 3`**: resumen de las líneas `[profiler]` de `Kex.log` y de sus archivados. Si no hay líneas, el
   profiler está apagado: dilo, sigue con el volcado y pide que lo active (Settings > General > Diagnostics).
3. **Si va lenta ahora mismo**, `sample --pid N` (10 s) y después `analyze FICHERO`. Hay que saber que los episodios
   duran de uno a trece minutos y que un volcado lanzado un minuto tarde sale sano; si pasa, no concluyas nada de él.
4. **Si ya se le pasó**, busca los `sample-auto-*.txt` en la carpeta de logs: los deja `watch` cuando la webview pasa
   del 60 % de CPU. Analízalos todos y compáralos con la línea base.
5. **Si no hay nada que analizar**, pide al usuario que deje `python3 performance/kexperf.py watch` corriendo en una
   terminal (mejor fuera de Kex, que es lo que se está midiendo) y que active el profiler. Sobrevive a los reinicios
   de Kex porque revisa las instancias en cada vuelta.

Cuando contestes: primero el resultado en una frase, después lo medido, y marca cada explicación como "medido" o
"hipótesis". No propongas un arreglo de código hasta que un volcado lento lo respalde.

## Qué hay (cambios al código y herramientas)

- **`src/modules/profiler/`**: el profiler dentro de la app. Envuelve `window.requestAnimationFrame`; cada 10 s
  escribe en `Kex.log` una línea `[profiler] {json}`. Partes puras con pruebas: `lib/rafStats.ts` (acumular, informe,
  origen de cada callback) y `lib/domCensus.ts` (cuántos nodos y terminales hay). Capa fina: `lib/profiler.ts`
  (instala y quita el envoltorio, bucle de fotogramas propio para contar los de más de 100 ms) y
  `lib/useProfilerSetting.ts` (sigue la preferencia en cada ventana).
- **Preferencia `performanceProfiler`** (`settings-general.json`, falso por defecto): Settings > General >
  Diagnostics, o la entrada de la paleta "Enable/Disable performance profiler" (`profiler.toggle`, sin atajo). Es la
  única fuente de verdad, persiste entre reinicios y cada ventana ejecuta su propio profiler, por eso cada línea lleva
  el campo `window`. Apagado no cuesta nada. Encendido añade una captura de pila por cada `requestAnimationFrame` y un
  bucle propio de fotogramas; su coste **no está medido**.
- **Rotación de logs** (`src-tauri/src/lib.rs`, `LOG_ARCHIVES_KEPT`): 20 archivos de 1 MB además de `Kex.log`, unos
  21 MB. Una línea del profiler ronda 1 KB, así que con él encendido un fichero dura de 1 a 2,5 horas y los 21 cubren
  uno o dos días. Los archivados se llaman `Kex_<fecha>.log`.
- **`performance/kexperf.py`** (con `test_kexperf.py`, `python3 -m unittest discover -s performance`):
  - `status`: instancias de Kex y sus procesos de WebKit con CPU instantánea y memoria.
  - `sample`: volcado nativo (`/usr/bin/sample`) del `WebContent` de un Kex, en la carpeta de logs de esa instancia.
  - `watch`: bucle que saca el volcado solo cuando un webview está al 60 % de CPU o más dos comprobaciones seguidas
    (`--above`, `--every`, `--cooldown` 600 s, `--once`). Los deja como `sample-auto-*.txt`.
  - `analyze`: reparto del hilo principal de uno o varios volcados, con la línea base al lado y un veredicto.
  - `profiler`: resumen de las líneas `[profiler]` (reparto de `rafShare`, fotogramas lentos, censo del DOM, peores
    ventanas y callbacks más caros).
- **Documentación**: `docs/BUILD.md` ("Profiling a slow window"), `docs/ARCHITECTURE.md` (mapa de módulos) y
  `docs/FORK.md` ("Performance profiler").

## Cómo leer los resultados

**Línea `[profiler]`**: `rafShare` es la fracción de la ventana (`windowMs`) que el hilo principal pasó dentro de
callbacks de `requestAnimationFrame`; `jankFrames` y `worstGapMs` cuentan los fotogramas que llegaron 100 ms o más tras
el anterior; `census` da `nodes`, `xterms` (terminales ligadas a una tab), `domRendererTerminals` y `webglTerminals`
(qué renderizador usa cada una) y `domRows`; `top` son los 12 callbacks más caros con `origin` (código del callback más
los seis frames que lo registraron), `calls`, `ms`, `avg` y `max`. Entre episodios no hay líneas útiles: sin
`requestAnimationFrame` la ventana no se dibuja (oculta u ocluida).

**Volcado**: lo que cuenta es el hilo `main-thread` del proceso `WebContent`.

- `mach_msg2_trap` es el hilo dormido. Los hilos "Heap Helper" o los anónimos en `__workq_kernreturn` y
  `__psynch_cvwait` parecen ocupados pero esperan; no cuentan.
- `WebPage::updateRendering` es todo el ciclo de renderizado; dentro van `Document::updateLayout` (layout),
  `Style::TreeResolver::resolve` (estilos CSS), `serviceRequestAnimationFrame` (el JavaScript que mide el profiler) y
  `RenderLayerBacking::paintContents` (pintar).
- `WebCore::timerFired` (en `analyze`, `run_from_timers`) engloba todo lo que se ejecuta desde un temporizador, el
  renderizado incluido. No lo sumes a los demás.
- El JavaScript sale sin nombres en el volcado. Para saber qué código es, está el profiler.
- `jit_wait` (`JITWorklist::suspendAllThreads`) es el hilo principal parado esperando a que el compilador JIT de
  JavaScriptCore se pause. Una recolección de basura no puede empezar hasta entonces, así que sale también como `gc`
  al 100 %: no es coste de renderizado ni de recolección, y `analyze` da el veredicto `stalled` cuando pasa del 20 %.
  El volcado nombra la fase del JIT atascada en el hilo `JIT Worklist Helper Thread`.

**Línea base del hilo principal** (porcentaje de las muestras, 2026-10-20 y 21):

| | Sana | Lenta (instrumentada, 4 h abierta) | Lenta (instalada, 21 h abierta) |
|---|---|---|---|
| Dormido | 62 % y 78 % | 4 % | 24 % |
| `updateRendering` | 19 % y 12 % | 74 % | 49 % |
| Layout | 5 % y 2 % | 20 % | 3 % |
| Estilos | 3 % y 0,2 % | 17 % | 1 % |
| JavaScript de `requestAnimationFrame` | 3 % | 14 % | 39 % |

Las dos muestras lentas **no son iguales**: la lentitud no es un patrón único. La de 21 horas tenía la webview en
2,9 GB de RSS; la otra en unos 0,7 GB. Con la de 21 horas dominaba el JavaScript de `requestAnimationFrame` (se
desconoce de quién, el volcado no lo dice); con la otra, estilos y layout.

## Lo medido (hecho)

- Producción (`support`) y desarrollo (`support-dev`) tienen datos distintos: 26 terminales y 1 markdown despiertos
  frente a 35 tabs. Una instancia nueva con datos de desarrollo no reproduce la lentitud de producción.
- Los episodios son reales y se repiten: la webview al 90 %-100 % de CPU durante entre uno y trece minutos, con calma
  total entre medias (visto anoche entre las 22:57 y las 23:10, y otra vez a las 07:40 de la mañana).
- En esos episodios el JavaScript de `requestAnimationFrame` es solo del 2 % al 9 % del hilo principal. La CPU se va en
  estilos, layout y pintado.
- Dentro de lo que sí ocupa `requestAnimationFrame`, el 95 % es el repintado de xterm (`_innerRefresh`) disparado desde
  `resetModePrivate`, de 2 a 7 ms de media según la carga, hasta 650 veces por ventana de 10 s con agentes activos.
- Scrollback de 5000 líneas son unos 7 MB por terminal; el scrollback **no** explica los 3 GB.
- El presupuesto `backgroundMemoryBudgetMb` en 256 permite unas 35 terminales aparcadas, así que con 26 ninguna se
  libera. `WEBGL_MAX_CONTEXTS` es 7 y a los 30 s de ocultar una terminal se le suelta el WebGL.

- 2026-10-24 16:23: volcado automático de un congelón con el hilo principal bloqueado todo el volcado (4727 muestras)
  esperando al JIT. El hilo `JIT Worklist Helper Thread` pasó el 100 % compilando con `IntegerRangeOptimizationPhase`
  de DFG (`mergeTo`, `mergeConstantsImpl`). El profiler de la misma franja registró un hueco de hasta 50,9 s entre
  fotogramas. JavaScriptCore no tiene una opción para apagar esa fase: solo `useFTLJIT`, `useDFGJIT` y
  `useConcurrentJIT`, y no se probó que lleguen por `JSC_*` a la webview de Tauri.
- El monitor externo corre como LaunchAgent `com.avilches.kexperf-watch` (`~/Library/Logs/kexperf-watch.log`), sin
  versionar: 3,4 s de CPU en 47 min y 17 MB de RSS.

## Hipótesis abiertas (no confirmadas) y cómo comprobarlas

0. **Qué función de JavaScript dispara la compilación DFG que congela la webview.** El volcado nativo no la nombra.
   Prueba: `pnpm build:local --performance` y volcados del siguiente congelón.

1. **El spinner `braille`** (el usuario lo tiene): un único `setInterval` de 80 ms re-renderiza todos los spinners y
   cambia un carácter en cada uno, lo que fuerza estilos y layout en las filas `flex` de la barra de workspaces y de las
   pestañas mientras haya agentes trabajando. Prueba: cambiar a `arc` o `cursor` en Settings > Appearance y comparar
   `status` y los volcados durante un episodio. Código: `src/components/ui/spinner.tsx`.
2. **Las terminales ocultas se repintan igual** (renderizador de DOM tras soltar el WebGL, un elemento por fila). Prueba
   barata: `backgroundMemoryBudgetMb` en 0 libera cada terminal oculta y su salida va a un búfer sin renderizar. El
   campo `census` del profiler (`domRendererTerminals`, `domRows`) enseña cuántas hay.
3. **Los repintados de xterm vienen del fin de cada fotograma de salida sincronizada** (modo 2026, que usan las TUI).
   No se comprobó qué modo llega a `resetModePrivate`.
4. **El proceso de GPU** de WebKit consume CPU propia (visto al 25 %) con las terminales en WebGL. Sin investigar.
5. **Pendiente de construir**: un contador de repintados por terminal que distinga visible de oculta; el instrumento
   actual no atribuye cada repintado a una terminal.

## Trampas

- `ps` trunca `ucomm` a 16 caracteres, así que los procesos de WebKit llegan como `com.apple.WebKit`. Hay que mirar el
  comando completo. El campo viene además relleno de espacios.
- Los procesos de WebKit cuelgan de `launchd` (ppid 1). El vínculo con Kex es el proceso responsable
  (`responsibility_get_pid_responsible_for_pid`, vía `ctypes`), que es lo que usa `kexperf.py`. La hora de arranque no
  vale: WebKit relanza un `WebContent` al abrir otra ventana, como Settings, y cada ventana de Kex tiene el suyo.
- El `%CPU` de `ps` no es instantáneo (es una media); `kexperf.py` usa `top` con dos muestras de un segundo para tener
  la CPU del momento.
- Dos Kex con el mismo identificador (`app.betauer.kex`: la instalada y cualquier build release de un worktree) usan los
  mismos datos de producción. No las abras a la vez: se pisan `workspaces.json` y reanudan las mismas sesiones de
  agente. Un build de desarrollo usa `app.betauer.kex.dev` y sus propios datos.
- No se puede mover ni redimensionar la ventana desde un agente: `osascript` no tiene permiso de accesibilidad.
- Hasta el 2026-10-21, `pnpm tauri build` desde una carpeta `target` nueva fallaba con Rust 1.96 (`can't find crate
  for ...` en macros de procedimiento como `tauri_macros` o `thiserror_impl`), mientras que `cargo build --release`
  con el mismo `strip = true` pasaba. Se arregló con `[profile.release.build-override] strip = "none"` en
  `src-tauri/Cargo.toml`, que deja de recortar solo las macros y los scripts de build; el ejecutable final sigue
  recortado (11,0 MB, frente a 13,8 MB sin recortar). La causa exacta no se investigó: se comprobó el efecto, no el
  motivo. Si reaparece el error, mira primero que esa sección siga en `Cargo.toml`.
- Para nombres de función legibles en un release, `pnpm build:local --performance` compila sin minify (el bundle del
  frontend pasa de unos 11,7 MB a 16). En el release normal las funciones locales salen con el nombre mutilado. Instala
  en `/Applications` como el build normal: vuelve a un `pnpm build:local` a secas cuando termines de investigar.
- Instrumentar siempre en un worktree propio y no dejar ese código en `main`. Un volcado de `sample` desde un agente
  funciona sin permisos especiales.
- Un volcado sano sirve de poco por sí solo: hace falta uno lento y uno sano del mismo estado para comparar.
