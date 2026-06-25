# F15 - Mejoras del sistema de blocks del terminal

**Prioridad:** Media-alta
**Esfuerzo:** Variable (ver items individuales)

## Contexto

El sistema de blocks ya esta completo en su base (~2.500 lineas, produccion): OSC 133 A/B/C/D cableado en Rust y TypeScript, decoraciones visuales con dividers por exit code, overlay con tiempo/cwd/botones, busqueda dentro de bloque, re-ejecutar comando, copiar output, navegacion entre bloques, sticky header y deteccion de alt-screen.

Lo que sigue son las capas de valor que faltan, ordenadas de menor a mayor complejidad.

---

## Items

### B1 - Collapse de outputs largos

**Esfuerzo:** Bajo

Auto-colapsar outputs de mas de N lineas (configurable, default ~50) con un toggle de expand/collapse por bloque. Imprescindible para `npm install`, `cargo build`, `docker pull`, test runners.

La infraestructura de lineas de inicio/fin ya existe en `BlockMeta` (`startLine`, `endLine`). Solo falta la logica de plegado en `BlockDecorations` y el boton en `BlockOverlay`.

Criterios:
- El bloque colapsado muestra el comando, el exit code, la duracion y "N lineas (expand)".
- El expand es instantaneo (sin re-renderizado de xterm).
- La preferencia de collapse es por bloque, no global: expandir uno no expande todos.
- El umbral N debe ser configurable en Settings (ajuste global del editor, seccion Terminal).

---

### B2 - Filtrado de bloques en la sesion activa

**Esfuerzo:** Bajo-medio

UI para mostrar en el terminal solo los bloques que cumplan un criterio:
- Solo errores (exit code != 0)
- Comandos lentos (duracion > X segundos)
- Comandos en un cwd especifico
- Patron de texto en el comando (mini-grep sobre `BlockMeta.command`)

El filtro vive en `BlockOverlay` y actua sobre la lista de bloques en memoria de `BlockDecorations`. No modifica el scrollback de xterm, sino que hace scroll hasta el siguiente bloque que cumple el criterio (similar a como funciona la navegacion prev/next actual).

Criterios:
- Accesible via shortcut y desde el overlay del bloque.
- No altera el output del terminal, solo la navegacion.

---

### B3 - Persistencia estructurada del historial de bloques

**Esfuerzo:** Medio

Guardar los metadatos de cada bloque a disco al terminar el comando. Estructura minima:

```typescript
type PersistedBlock = {
  id: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  startedAt: number;   // epoch ms
  finishedAt: number;
  durationMs: number;
  workspaceId: string; // para aislar por workspace
};
```

El output completo es opcional en v1 (puede ser costoso). Con solo los metadatos ya se puede construir un historial util.

Almacenamiento: fichero NDJSON en `~/.cache/kex/block-history.ndjson`, rotado cuando supere un tamano maximo (p. ej. 10 MB). Leer/escribir en Rust via un nuevo comando IPC (`history_append_block`, `history_query_blocks`).

Criterios:
- Escritura no bloqueante (fire-and-forget desde el frontend o via canal Tauri).
- El fichero es legible por herramientas externas (NDJSON, no binario).
- Limite de tamano configurable en Settings (JSON-only en v1).

---

### B4 - Panel `command-history`

**Esfuerzo:** Medio

Nuevo tipo de panel (`kind: "command-history"`) que muestra todos los comandos ejecutados en la sesion actual (y, si B3 esta implementado, tambien el historial persistido). Similar en concepto a `git-history`.

Columnas: comando, cwd, exit code (icono verde/rojo), duracion, timestamp.

Funcionalidades:
- Busqueda por texto sobre el comando.
- Filtro por exit code, por cwd, por rango de fechas.
- Click en una fila muestra el output del bloque (si esta en memoria) o lo navega en el terminal de origen.
- Re-ejecutar el comando en el terminal activo.

Documentacion a actualizar al implementar: `docs/ARCHITECTURE.md`, `docs/IPC.md` (si hay nueva IPC de query), `docs/FORK.md`.

---

### B5 - Export de bloques

**Esfuerzo:** Bajo

Seleccionar uno o varios bloques y exportar:
- Como **markdown**: comando en code fence, output debajo. Util para documentar pasos de debugging o compartir resultados.
- Como **script `.sh`**: solo los comandos, en orden. Genera un script reproducible de la sesion.
- Como **texto plano**: dump directo.

Accesible desde el menu contextual del overlay de cada bloque y desde una seleccion multiple en el panel `command-history` (si B4 esta implementado).

---

### B6 - Notebooks (techo de la feature)

**Esfuerzo:** Alto

Nuevo tipo de panel (`kind: "notebook"`) que permite componer una secuencia de celdas-comando, ejecutarlas una a una o en orden, ver los outputs inline, y guardar el conjunto como un fichero `.kexbook` (JSON o YAML).

Analogia: Jupyter Notebook pero para el terminal, sin cloud ni AI.

Casos de uso:
- Runbooks de deploy: secuencia de comandos con outputs esperados.
- Scripts de setup documentados: cada celda puede tener un titulo/descripcion en markdown.
- Checklists de debugging: ejecutar paso a paso y marcar cuales tienen el output esperado.

Estructura de una celda:

```typescript
type NotebookCell = {
  id: string;
  description?: string;   // markdown libre, renderizado encima del comando
  command: string;
  workingDir?: string;    // cwd override; si no, hereda del workspace
  lastRun?: {
    exitCode: number;
    durationMs: number;
    output: string;       // output capturado (no xterm, sino texto plano)
    ranAt: number;
  };
};
```

El notebook se guarda en disco (IPC `notebook_save`, `notebook_load`, `notebook_list`). Se puede abrir desde el explorador de ficheros al hacer click en un `.kexbook`.

Criterios de una primera version:
- Crear/abrir/guardar notebooks desde el explorador.
- Ejecutar celdas una a una; el output se captura y se muestra en la celda.
- Re-ejecutar una celda individual.
- Editar el comando y la descripcion inline.
- Sin colaboracion en tiempo real, sin cloud, sin AI.

Documentacion a actualizar: `docs/ARCHITECTURE.md`, `docs/IPC.md`, `docs/FORK.md`.

---

## Orden de implementacion sugerido

| Orden | Item | Razon |
|-------|------|-------|
| 1 | B1 - Collapse | Maximo impacto, minimo riesgo, base ya existe |
| 2 | B2 - Filtrado | Complementa la navegacion existente, sin nueva IPC |
| 3 | B5 - Export | Bajo esfuerzo, valor inmediato |
| 4 | B3 - Persistencia | Habilita B4 y da valor independiente |
| 5 | B4 - Panel history | Depende de B3 para el historial completo |
| 6 | B6 - Notebooks | Feature de alto valor, requiere diseno de UX propio |
