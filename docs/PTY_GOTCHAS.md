# PTY - bugs encontrados y cómo se resolvieron

Este documento registra los problemas de la capa PTY/procesos que resultaron no obvios de
diagnosticar. El objetivo es que no haya que re-descubrirlos.

Para entender cómo funciona el sistema, lee primero el documento PLATFORM.md.

---

## Bug 1: Stop/Kill no hace nada si el proceso de foreground es setuid (top, sudo...) (RESUELTO)

### Síntoma

Con un comando de foreground setuid (`top`, `sudo`, `passwd`) corriendo en un terminal, ni
`pty_stop` (SIGTERM al árbol) ni `pty_kill` (SIGKILL) hacían nada: la terminal seguía igual.
Con otros procesos (`sleep`, un dev server, `claude`) el mismo camino funcionaba.

### Pistas falsas descartadas

- Que el lookup de la sesión fallara: el log de señal mostraba el `tab_id` y el `shell_pid`
  correctos; el fallo venía después.
- Que el proceso hubiera terminado solo: `pty_process_info` (pgrep) seguía viéndolo como
  hijo del shell justo antes de la señal.
- Un problema del wiring del menú: la invocación llegaba al comando con los argumentos
  correctos.

### Causa raíz

El árbol de descendientes se construía desde el snapshot de `sysinfo`. En macOS, sysinfo
lee el padre vía `proc_pidinfo(PROC_PIDTBSDINFO)`, y esa llamada está bloqueada para
procesos setuid-root (`/usr/bin/top` es `-r-sr-xr-x root`): sysinfo devuelve
`parent() == None` para ellos, la reparación con `proc_pidinfo` desde otro uid tampoco
devuelve nada, y el walk desde el shell no encuentra al hijo: `signaled=0` siempre.
La misma tabla rota alimenta al path bar, así que el CPU/RAM de un `top` tampoco se
agregaba. `ps` sí ve el ppid real de un proceso setuid sin privilegios, y `pgrep -P`
también.

### Fix

La tabla padre/hijo que alimenta a `descendants_of` y a `aggregate_tree` sale ahora de
`ps -axo pid=,ppid=` (`real_proc_table()` en `pty/metrics.rs`): un spawn por tick de
métricas (lote de todos los tabs visibles) y otro por Stop/Kill; sysinfo queda para lo
que es delta-based (CPU%, memoria, nombre). Cubierto por tests que ejercitan el walk
contra la tabla real.

### Lección

Cualquier cosa que camine el árbol de procesos no puede depender del padre de sysinfo en
macOS: hay ejecutables del sistema cuyos datos de proceso se esconden a propósito. La
fuente del árbol y la fuente de las métricas pueden (y conviene que sean) distintas.

---

## Bug 2: omp se pasa por el prompt del shell y engaña al estado de prompt (RESUELTO)

### Síntoma

El atajo Ctrl+R (abrir la palette en modo `>`) se portaba bien con Claude Code en el
terminal (bloqueado mientras corre) pero se abría igual con omp corriendo en otro
terminal, aunque la regla era no disparar mientras un comando tenga el foreground.

### Pistas falsas descartadas

- Que omp no pasara por el preexec del shell: pasa, y el OSC 133 C del shell llega con
  `omp` como comando.
- Que omp corrija en alt-screen: corre inline, `isLeafAltScreen` es falso.

### Causa raíz

omp emite sus propios marcadores OSC 133 a propósito (en
`packages/tui/src/chat/user-message.ts` del bundle: `133;A` delante del mensaje del
usuario y `133;B` + `133;C` + `133;D;0` detrás) para que los terminales con blocks lo
pinten como un bloque de comando. El `PromptTracker` del frontend recibe esa ráfaga y la
lee como "el shell volvió al prompt": `A` limpia el comando en marcha, y el `C` llega sin
texto (como el de bash), así que el store de comandos en marcha queda vacío mientras omp
trabaja. Para el gate de Ctrl+R el terminal parecía libre.

### Fix

El gate de Ctrl+R (`shortcutsDisabled` en `App.tsx`) mantiene el chequeo síncrono barato,
y el handler repite la decisión con `pty_has_foreground_process` (pgrep del primer hijo
del shell): mientras cualquier proceso tenga el foreground, la palette no se abre. Esa
comprobación es inmune a los marcadores falsos y cierra de paso la carrera de un comando
que arranca justo entre la pulsación y el OSC 133 C.

### Lección

Ningún agente CLI es fuente de verdad del estado del shell: los que se integran con
terminales de blocks emiten su propio OSC 133 y borran el nuestro. La única señal que no
se puede falsificar es el árbol de procesos real.
