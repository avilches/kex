# Workspace hibernado

Tarea: TASK-804. La fase 2 (cerrar workspace con el mismo modal) es TASK-805 y queda fuera de este spec.

## Objetivo

Un workspace con muchas terminales, agentes y editores consume memoria aunque nadie lo use. Un workspace
hibernado conserva la estructura de panes en su JSON, pero no monta ninguna tab. Al despertarlo se recuperan
los editores, los comandos con Run on start y los agentes.

## Comportamiento

- `Workspace.hibernated?: boolean` se persiste en `workspaces/<id>.json`. Por defecto es falso. Sin compatibilidad
  hacia atras: un JSON sin el campo es un workspace despierto.
- Hibernar equivale a cerrar todo: se matan siempre todos los procesos. La diferencia con cerrar es que las tabs
  siguen en el `paneTree`, asi que al despertar se pueden recuperar.
- Un workspace hibernado muestra sus panes y divisores, sin tabs ni barra de tabs, y una capa encima con "Zzzzz" y
  un boton Restore. La capa bloquea los eventos del workspace.
- Se puede hibernar el workspace activo. Se queda a la vista con la capa y se despierta con Restore.
- Atajo `workspace.hibernate`, por defecto Cmd+Alt+Z, registrado en `SHORTCUTS` (reasignable en Settings).
  Los atajos de tabs no hacen nada sobre un workspace hibernado.
- La WorkspaceBar sigue listando el workspace hibernado. Su lista anidada de tabs queda vacia.
- Un workspace hibernado sigue hibernado tras reiniciar Kex y no consume nada.

## Modal de hibernar

Componente reutilizable (la fase 2 lo enchufa a cerrar workspace). Alimentado por la funcion pura
`hibernateReview(workspace, liveState)`, que devuelve tres listas:

1. **Agentes con spinner**: terminales con sesion de agente en estado `working`. Siempre avisan, tengan o no Run on
   start, porque se perderia el trabajo en curso.
2. **Documentos sin guardar**: tabs `editor` y `markdown` con `dirty`. Cada fila lleva un boton Save, y debajo hay
   un Save all. Las filas desaparecen segun se guardan.
3. **Comandos sin Run on start**: terminales con comando (`runningCommand` o `persistentCommand`) y
   `restoreOnRestart` distinto de verdadero, o agentes con `restoreOnRestart === false`. Cada fila lleva un boton
   que activa Run on start y hace desaparecer la fila. Quedan fuera las terminales de scripts del RunButton
   (`workspace.scripts.some(s => s.tabId === tab.id)`): se recuperan pulsando Run, que reescribe el comando.

No avisan: agentes en reposo con Run on start, terminales con Run on start, shells vacios.

Reglas del flujo:

- Antes de calcular nada, si el autosave esta activo se guardan todos los documentos sucios (mismo handle de
  guardado que usan Save y Save all, `editorHandles` en `App.tsx`). Si alguno falla, se queda como fila.
- Si las tres listas estan vacias, se hiberna directamente.
- Si hay alguna, el modal se abre y espera. Esto incluye el caso en que solo hay comandos sin Run on start.
- El modal se suscribe a los stores en vivo: un spinner que termina o un documento que se guarda quitan su fila.
- Cuando el modal estaba abierto y las tres listas se vacian, se cierra solo y se hiberna.
- Con filas pendientes hay dos botones: **Close** cierra el modal sin hibernar y **Hibernate anyway** mata los
  procesos y cierra los editores sin guardar.

## Hibernar

1. Anadir los ids de las terminales del workspace a `hibernatingTabs` (ver "Registro de sesion").
2. Destruir los flotantes del workspace (`destroyWorkspaceFloats`).
3. `hibernated: true` y persistir. Las tabs dejan de montarse, lo que cierra los PTY y los editores por el camino
   normal de desmontaje.

## Despertar (Restore)

1. Para cada terminal con Run on start, `previewResumeCmd(tab.id)` y `seedRestorePlan(tab.id, plan)`. Es el mismo
   camino que la reapertura de tabs cerradas (`useWorkspaces.ts`).
2. Vaciar `hibernatingTabs`.
3. `hibernated: false`. Las tabs se montan con los mismos ids, cada terminal consume su plan al arrancar (agentes
   con su comando de resume, comandos persistentes escritos tras abrir el PTY) y los editores reabren desde disco.
4. Las terminales sin Run on start y las de scripts vuelven como shell vacio en su cwd.
5. Un agente que no puede reanudarse sigue el camino de error existente (`restoreError`).

## Registro de sesion de los agentes

Riesgo detectado: al terminar un agente, `AgentNotificationsBridge.handleSignal` llama a `agent_detach_session`
(`session_store.rs`, `detach_session`), que borra su registro. Matar un PTY con un agente armado emite `exited`
(`agent_detect.rs`, `finish`). Hoy el registro sobrevive al cerrar una tab o la app solo por una carrera: la sesion
del terminal ya se ha descartado y `leafIdForPty` devuelve `null` cuando llega la senal. No es una garantia.

Solucion:

- `hibernatingTabs`, un conjunto en memoria en el modulo de agentes. `handleSignal` consulta el conjunto: si la tab
  esta dentro, ejecuta `store.finish(tabId)` (limpia la UI) pero no llama a `agent_detach_session`.
- Se vacia al despertar, tras sembrar los planes. Una senal tardia del PTY viejo no afecta al nuevo, que tiene otro
  id de PTY.
- Supervivencia a un reinicio: `agent_session_restore_plan` descarta con `split_orphans` los planes de tabs que no
  estan en ninguna ventana. Las tabs de un workspace hibernado siguen en el JSON, asi que `terminal_tab_ids()` debe
  incluirlas. Se verifica con un test en Rust. Si el plan del arranque queda sin consumir en `restorePlans`, el
  despertar lo reutiliza o lo sobrescribe sin problema.

## Pruebas

- `hibernateReview`: spinner, agente en reposo con y sin Run on start, terminal de script, shell vacio, documento
  sucio, mezcla de todo, comando con `persistentCommand` pero sin Run on start.
- `useWorkspaces`: transicion hibernar y despertar (el arbol no cambia, el flag se persiste, los planes se
  siembran), siguiendo el patron de `useWorkspaces.test.ts`.
- Proteccion del registro: una senal `exited` sobre una tab en `hibernatingTabs` no llama a
  `agent_detach_session`; sobre una tab normal si.
- Rust: las tabs de un workspace hibernado cuentan como conocidas en `split_orphans`.
- `SHORTCUTS`: el atajo existe, es reasignable y no choca con otros.

## Documentacion (mismo commit que el codigo)

`docs/ARCHITECTURE.md` (modelo y limitaciones), `docs/WORKSPACES.md` (render del workspace hibernado),
`docs/AGENT_SESSION_RESTORE.md` (`hibernatingTabs` y el flujo de despertar) y `docs/FORK.md` (funcionalidad nueva
respecto al upstream). Anadir al glosario de `CLAUDE.md` el termino **Workspace hibernado**.

## Fuera de alcance

- Cerrar workspace con el modal compartido (TASK-805).
- Hibernacion automatica por inactividad.
- Relanzar scripts del RunButton al despertar.
