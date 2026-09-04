---
id: TASK-15
title: 'CLI kex: API de control externa via socket (estilo cmux)'
status: To Do
assignee: []
created_date: '2026-09-04 01:21'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: low
type: idea
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: idea anotada (2026-06-24), por disenar.

Crear un comando CLI kex que se comunique con la aplicacion en ejecucion a traves de un socket, para consultar e interactuar con su estado desde scripts o agentes externos. Inspiracion directa: la API de cmux.

Que deberia ofrecer (mismas operaciones por CLI y socket directo, como hace cmux):
- Consultar: listar workspaces, panes/superficies, paneles (con su kind, cwd, fichero, url), la ventana/foco actual, y identify del contexto desde el que se invoca.
- Enviar input: mandar texto o pulsaciones de tecla (enter, tab, escape) a un terminal enfocado o a una superficie concreta.
- Recibir datos: leer output/estado de un panel (ultimas lineas, cwd, estado del agente).
- Acciones de layout: abrir paneles, crear splits direccionales, enfocar una superficie, crear/seleccionar/cerrar workspaces.
- Notificaciones / metadata de sidebar: crear alertas, indicadores de estado o progreso.
- Utilidad: ping para disponibilidad y consulta de capacidades del socket.

Protocolo (boceto): socket Unix en /tmp/kex.sock (ruta configurable via env KEX_SOCKET_PATH); en Windows, named pipe. Mensajes JSON terminados en salto de linea, estructura JSON-RPC.

Base tecnica ya disponible (no reinventar): ya existe un socket Unix por-panel en src-tauri/src/modules/pty/ipc.rs (UnixListener, env KEX_IPC), pero hoy es unidireccional (hook -> Kex) y solo para eventos SessionStart/SessionEnd de Claude Code. Esta API es distinta: un socket de control global y bidireccional de proposito general. El estado de Workspace/Pane/Panel vive en useWorkspaces (frontend); habria que decidir como expone el backend ese estado.

Seguridad: control de acceso obligatorio, como cmux: modo desactivado por defecto o restringido (off / solo procesos kex / cualquier proceso local). Validar y autorizar en el boundary del socket. Cuidado especial con enviar input a un terminal desde un proceso externo: es una superficie de ejecucion de comandos.

Por que es valioso: habilita automatizacion, scripting y orquestacion por agentes sin tocar la UI. Es la base de integraciones tipo un agente conduce Kex.
<!-- SECTION:DESCRIPTION:END -->
